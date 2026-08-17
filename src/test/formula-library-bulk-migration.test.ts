import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import identitiesManifest from "../../resources/formula-library/v1/standard-formula-ids.json";
import {
  assertPrivateMode,
  assertRightsContract,
  corpusPathSnapshotHash,
  corpusSnapshotHash,
  gpuFailureReason,
  releaseOracleMatches,
  sanitizeControllerError,
  walkCorpus,
  writePrivateLedger,
  type WorkRow,
} from "../../scripts/formula-library-bulk-migration";
import { compileClassicFrmEntry } from "@/engine/frm/compile";
import { scanFrmEntries } from "@/engine/frm/scanner";
import {
  canonicalizeFrmLikeV1,
  hashFrmLikeV1,
  parseFrmLikeV1,
} from "@/engine/frm/v1";
import { compileFrmLikeV1Backend } from "@/engine/frm/v1-backend";
import {
  FORMULA_LIBRARY_BULK_REASON_CODES,
  projectClassicAstToFrmLikeV1,
  runFormulaLibraryCpuSmoke,
  runFormulaLibraryOracle,
  selectClassicMigrationEntry,
} from "@/engine/formulas/v1/bulk-migration";
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
  type FormulaDefinitionV1,
  type FormulaIdV1,
  type FormulaRevisionV1,
} from "@/engine/formulas/v1";

const FORMULA_ID = identitiesManifest.formulas[0].formulaId as FormulaIdV1;
const CLASSIC = `BulkSynthetic[function=sin] {
  z = pixel, saved = (0, 0):
  if real(z) > 0
    real(saved) = real(z)
  else
    imag(saved) = imag(z)
  endif,
  z = fn1(z) + p1 + saved,
  |z| <= 4
}`;

function compiledClassic(source = CLASSIC) {
  const compiled = compileClassicFrmEntry(source, undefined, "bulk-synthetic", 2);
  expect(compiled.success).toBe(true);
  expect(compiled.ast).toBeDefined();
  if (!compiled.success || !compiled.ast) throw new Error(compiled.errors.join("\n"));
  return compiled;
}

describe("formula-library bulk migration foundations", () => {
  it("freezes the complete stable census reason vocabulary", () => {
    expect(FORMULA_LIBRARY_BULK_REASON_CODES).toEqual([
      "missing-input",
      "identity-or-alias-mismatch",
      "classic-lowering-failed",
      "v1-projection-unsupported",
      "v1-parse-failed",
      "canonical-roundtrip-failed",
      "safety-envelope-failed",
      "backend-compile-failed",
      "cpu-runtime-failed",
      "release-oracle-mismatch",
      "webgl-compile-link-draw-failed",
      "webgl-cpu-mismatch",
      "nondeterministic-output",
      "controller-internal-error",
    ]);
    expect(Object.isFrozen(FORMULA_LIBRARY_BULK_REASON_CODES)).toBe(true);
    expect(gpuFailureReason("passed")).toBeNull();
    expect(gpuFailureReason("semantic-mismatch")).toBe("webgl-cpu-mismatch");
    expect(gpuFailureReason("nondeterministic")).toBe("nondeterministic-output");
    expect(gpuFailureReason("failed")).toBe("webgl-compile-link-draw-failed");
    expect(gpuFailureReason(undefined)).toBe("webgl-compile-link-draw-failed");
    expect(
      sanitizeControllerError(
        new Error("ENOENT: no such file or directory, lstat '/private/secret.frm'"),
      ),
    ).toBe("controller-internal-error");
    expect(sanitizeControllerError(new Error("private-input-unavailable"))).toBe(
      "private-input-unavailable",
    );
  });

  it("enforces per-row rights lanes before source access", () => {
    const baseRevision = "a".repeat(40);
    const direct: WorkRow = {
      formulaId: FORMULA_ID,
      sourceSet: "F588",
      typedLegacyAliases: [],
      rights: {
        class: "A",
        lane: "direct-adaptation",
        canonicalLicenseTarget: "MIT",
        rightsEvidenceStatus: "frozen-per-record-classification",
        sourceVisibility: "source-visible-after-content-gate",
      },
      implementationInput: {
        status: "ready-direct-source",
        inputKind: "approved-direct-source",
        safeSourceLocator: "formulas/example.frm",
        forbiddenForIsolatedImplementer: [],
      },
      workStartEligibility: "blocked-incomplete-package",
      review: { status: "blocked-incomplete-package" },
      fixturesOrOracle: {},
    };
    expect(() => assertRightsContract(direct, baseRevision)).not.toThrow();
    expect(() =>
      assertRightsContract(
        {
          ...direct,
          rights: { ...direct.rights, lane: "clean-room" },
        },
        baseRevision,
      ),
    ).toThrow("rights-contract-mismatch");

    const cleanRoom: WorkRow = {
      ...direct,
      rights: {
        class: "C",
        lane: "clean-room",
        canonicalLicenseTarget: "MIT",
        rightsEvidenceStatus: "frozen-per-record-classification",
        sourceVisibility: "isolated-controller-only",
      },
      implementationInput: {
        status: "blocked-missing-approved-nonreversible-behavior-spec",
        inputKind: "clean-room-math-behavior-spec",
        safeSourceLocator: null,
        behaviorSpecAuthor: null,
        behaviorSpecRevision: null,
        behaviorSpecSha256: null,
        forbiddenForIsolatedImplementer: [
          "third-party-original-source",
          "source-comments",
          "source-variable-names",
          "statement-layout",
          "complete-ast-or-ir",
          "private-source-paths",
        ],
      },
    };
    expect(() => assertRightsContract(cleanRoom, baseRevision)).not.toThrow();
    expect(() =>
      assertRightsContract(
        {
          ...cleanRoom,
          implementationInput: {
            ...cleanRoom.implementationInput,
            safeSourceLocator: "private/example.frm",
          },
        },
        baseRevision,
      ),
    ).toThrow("rights-contract-mismatch");
  });

  it("binds corpus paths and writes the private ledger with restrictive modes", () => {
    const root = mkdtempSync(join(tmpdir(), "formula-bulk-controller-"));
    try {
      chmodSync(root, 0o700);
      expect(() => assertPrivateMode(join(root, "missing-private.frm"), "file")).toThrow(
        "private-input-unavailable",
      );
      expect(() =>
        writePrivateLedger(join(root, "missing-repository"), "leak\n"),
      ).toThrow("private-output-write-failed");
      const corpus = join(root, "corpus");
      mkdirSync(corpus, { mode: 0o700 });
      const firstPath = join(corpus, "first.frm");
      const secondPath = join(corpus, "second.frm");
      writeFileSync(firstPath, "alpha", { mode: 0o600 });
      writeFileSync(secondPath, "beta", { mode: 0o600 });
      const before = walkCorpus(corpus);
      const contentHash = corpusSnapshotHash(before);
      const pathHash = corpusPathSnapshotHash(before);

      chmodSync(firstPath, 0o644);
      expect(() => assertPrivateMode(firstPath, "file")).toThrow(
        "private-input-permissions-too-broad",
      );
      chmodSync(firstPath, 0o600);

      writeFileSync(firstPath, "beta");
      writeFileSync(secondPath, "alpha");
      const after = walkCorpus(corpus);
      expect(corpusSnapshotHash(after)).toBe(contentHash);
      expect(corpusPathSnapshotHash(after)).not.toBe(pathHash);

      const repository = join(root, "repo");
      mkdirSync(repository, { mode: 0o700 });
      const privateRoot = join(repository, ".formula-library-private");
      const privateLeaf = join(privateRoot, "formula-library-v1");
      mkdirSync(privateLeaf, { recursive: true, mode: 0o755 });
      chmodSync(privateRoot, 0o755);
      chmodSync(privateLeaf, 0o755);
      const ledger = writePrivateLedger(repository, "{}\n");
      expect(statSync(privateRoot).mode & 0o777).toBe(0o700);
      expect(statSync(privateLeaf).mode & 0o777).toBe(0o700);
      expect(statSync(dirname(ledger)).mode & 0o777).toBe(0o700);
      expect(statSync(ledger).mode & 0o777).toBe(0o600);

      const symlinkRepository = join(root, "symlink-repo");
      const escape = join(root, "escape");
      mkdirSync(symlinkRepository, { mode: 0o700 });
      mkdirSync(escape, { mode: 0o700 });
      symlinkSync(
        escape,
        join(symlinkRepository, ".formula-library-private"),
        "dir",
      );
      expect(() => writePrivateLedger(symlinkRepository, "leak\n")).toThrow(
        "private-output-symlink-rejected",
      );
      expect(() =>
        statSync(join(escape, "formula-library-v1", "bulk-migration-ledger.json")),
      ).toThrow();

      const linked = join(corpus, "linked.frm");
      symlinkSync(firstPath, linked);
      expect(() => walkCorpus(corpus)).toThrow("corpus-symlink-rejected");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves Classic bracket selectors by name plus option token", () => {
    const scan = scanFrmEntries(`Variant {
      z = pixel:
      z = z + c,
      |z| < 4
    }
    Variant[float=y] {
      z = pixel:
      z = sqr(z) + c,
      |z| < 4
    }`);
    const selected = selectClassicMigrationEntry(
      scan.entries,
      "variant[float=y]",
    );
    expect(selected).toMatchObject({
      key: "Variant#2",
      name: "Variant",
      options: "float=y",
    });
    expect(
      selectClassicMigrationEntry(scan.entries, "variant[float=n]"),
    ).toBeNull();
    const broaderOnly = scanFrmEntries(`Variant[float=y extra=yes] {
      z = pixel:
      z = z + c,
      |z| < 4
    }`);
    expect(
      selectClassicMigrationEntry(broaderOnly.entries, "variant[float=y]"),
    ).toBeNull();
  });

  it("projects one production Classic AST into canonical FRM-like v1 without formula-specific rules", async () => {
    const compiled = compiledClassic();
    const projected = projectClassicAstToFrmLikeV1({
      formulaId: FORMULA_ID,
      ast: compiled.ast!,
      functionDefaults: compiled.plugin?.fnDefaults,
    });
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.reasonCode);

    expect(projected.ir.parameters).toEqual([
      {
        name: "parameter1",
        type: "complex",
        default: [0, 0],
        classicBinding: "p1",
      },
      {
        name: "function1",
        type: "function",
        default: "sin",
        classicBinding: "fn1",
      },
    ]);
    expect(projected.ir.locals).toContainEqual({
      name: "saved",
      type: "complex",
    });

    const source = canonicalizeFrmLikeV1(projected.ir);
    const reparsed = parseFrmLikeV1(source);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) throw new Error(reparsed.reason);
    expect(canonicalizeFrmLikeV1(reparsed.ir)).toBe(source);

    const hashes = await hashFrmLikeV1(source, reparsed.ir);
    const definition: FormulaDefinitionV1 = {
      schemaVersion: 1,
      formulaId: FORMULA_ID,
      scope: "standard",
      source,
      sourceRevision: hashes.sourceRevision as FormulaRevisionV1,
      semanticHash: hashes.semanticHash as FormulaRevisionV1,
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      supportedNumericProfiles: ["standard32"],
      parameters: reparsed.ir.parameters,
      programModel: "orbit",
      termination: {
        predicateMeaning: "continue-iteration",
        nonFinite: "terminate-with-event",
        maximumIterations: "profile-resolved",
      },
      channels: [],
      capabilities: [],
    };
    await expect(
      validateFormulaSafetyEnvelopeV1(
        projectExecutableFormulaDefinitionV1(definition),
      ),
    ).resolves.toMatchObject({ ok: true });

    const backend = compileFrmLikeV1Backend(reparsed.ir);
    expect(backend.ok).toBe(true);
    if (!backend.ok) throw new Error(backend.reason);
    expect(backend.backend.glsl.classicBindings).toEqual({
      p1: "parameter1",
      fn1: "function1",
    });
    expect(runFormulaLibraryCpuSmoke(backend.backend)).toEqual(
      runFormulaLibraryCpuSmoke(backend.backend),
    );
    const oracle = runFormulaLibraryOracle(
      backend.backend,
      [
        [0.25, 0.1],
        [-0.5, 0.3],
      ],
      4,
    );
    expect(oracle).toEqual(
      runFormulaLibraryOracle(
        backend.backend,
        [
          [0.25, 0.1],
          [-0.5, 0.3],
        ],
        4,
      ),
    );
    expect(oracle).toHaveLength(2);
    expect(oracle.every((run) => run.orbit.length > 0)).toBe(true);
    const expectedOracle = {
      maxIterations: 4,
      runs: oracle.map((run) => ({
        pixel: run.pixel,
        escapedAt: run.escapedAt,
        orbit: run.orbit.map((point) => {
          if (point[0] === "non-finite" || point[1] === "non-finite")
            throw new Error("unexpected-non-finite-test-orbit");
          return [point[0], point[1]] as const;
        }),
      })),
    } as const;
    expect(releaseOracleMatches(oracle, expectedOracle)).toBe(true);
    const mismatchedOracle = {
      ...expectedOracle,
      runs: expectedOracle.runs.map((run, index) =>
        index === 0
          ? {
              ...run,
              orbit: run.orbit.map((point, pointIndex) =>
                pointIndex === 0 ? ([point[0] + 1, point[1]] as const) : point,
              ),
            }
          : run,
      ),
    } as const;
    expect(releaseOracleMatches(oracle, mismatchedOracle)).toBe(false);
  });

  it("projects Classic fn slots without explicit function defaults onto the v1 identity stdlib function", () => {
    const compiled = compiledClassic(`IdentityDefault {
      z = pixel:
      z = fn1(z) + c,
      |z| < 4
    }`);
    const projected = projectClassicAstToFrmLikeV1({
      formulaId: FORMULA_ID,
      ast: compiled.ast!,
      functionDefaults: compiled.plugin?.fnDefaults,
    });
    expect(projected.ok).toBe(true);
    if (!projected.ok) throw new Error(projected.reasonCode);
    expect(projected.ir.parameters).toEqual([
      {
        name: "function1",
        type: "function",
        default: "identity",
        classicBinding: "fn1",
      },
    ]);

    const source = canonicalizeFrmLikeV1(projected.ir);
    const reparsed = parseFrmLikeV1(source);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) throw new Error(reparsed.reason);
    expect(canonicalizeFrmLikeV1(reparsed.ir)).toBe(source);

    const backend = compileFrmLikeV1Backend(reparsed.ir);
    expect(backend.ok).toBe(true);
    if (!backend.ok) throw new Error(backend.reason);
    expect(backend.backend.glsl.functionOptions).toContain("identity");

    const oracle = runFormulaLibraryOracle(backend.backend, [[0.25, 0.1]], 4);
    expect(oracle).toEqual(
      runFormulaLibraryOracle(backend.backend, [[0.25, 0.1]], 4),
    );
    expect(oracle).toHaveLength(1);
    const [run] = oracle;
    // init z = pixel; loop z = fn1(z) + c = z + c with c = pixel in
    // parameter-plane mode, so the orbit is an exact arithmetic progression.
    expect(run.orbit.length).toBeGreaterThanOrEqual(3);
    for (const [index, point] of run.orbit.entries()) {
      if (point[0] === "non-finite" || point[1] === "non-finite")
        throw new Error("unexpected-non-finite-identity-orbit");
      expect(point[0]).toBeCloseTo(0.25 * (index + 2), 6);
      expect(point[1]).toBeCloseTo(0.1 * (index + 2), 6);
    }
  });

  it("fails closed when the production AST contains a statement shape absent from FRM-like v1", () => {
    const compiled = compiledClassic(`BareExpression {
      z = pixel:
      sqr(z),
      z = z + c,
      |z| < 4
    }`);
    expect(
      projectClassicAstToFrmLikeV1({
        formulaId: FORMULA_ID,
        ast: compiled.ast!,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "v1-projection-unsupported",
    });
  });

  it("rejects identities outside the frozen Standard UUIDv5 namespace shape", () => {
    const compiled = compiledClassic();
    expect(
      projectClassicAstToFrmLikeV1({
        formulaId: "11111111-1111-4111-8111-111111111111",
        ast: compiled.ast!,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "v1-projection-unsupported",
    });
  });
});
