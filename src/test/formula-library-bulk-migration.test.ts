import { describe, expect, it } from "vitest";

import identitiesManifest from "../../resources/formula-library/v1/standard-formula-ids.json";
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
      "nondeterministic-output",
      "controller-internal-error",
    ]);
    expect(Object.isFrozen(FORMULA_LIBRARY_BULK_REASON_CODES)).toBe(true);
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
  });

  it("fails closed when Classic identity fn defaults are absent from frozen stdlib/1", () => {
    const compiled = compiledClassic(`IdentityDefault {
      z = pixel:
      z = fn1(z) + c,
      |z| < 4
    }`);
    expect(
      projectClassicAstToFrmLikeV1({
        formulaId: FORMULA_ID,
        ast: compiled.ast!,
        functionDefaults: compiled.plugin?.fnDefaults,
      }),
    ).toEqual({
      ok: false,
      reasonCode: "v1-projection-unsupported",
    });
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
