import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import candidateAsset from "../../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import { describe, expect, it } from "vitest";
import { parseFrmLikeV1 } from "../engine/frm/v1";
import {
  proposeJuliaPixelRecoveryCandidateV1,
  type JuliaPixelRecoveryCandidateRoleAuthorityV1,
} from "../engine/formulas/v1/julia-pixel-recovery-candidate";
import {
  JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
  JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1,
  parseJuliaPixelRecoveryCandidatesV1,
} from "../engine/formulas/v1/julia-pixel-recovery-candidates";
import { analyzeJuliaPixelRolesV1 } from "../engine/formulas/v1/julia-pixel-role-analyzer";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../engine/formulas/v1/revisions";
import { JULIA_PIXEL_RECOVERY_FIXTURES_V1 } from "./fixtures/julia-pixel-recovery-v1";

type CensusRow = JuliaPixelRecoveryCandidateRoleAuthorityV1 & {
  formulaId: string;
  authorityEvidence: { authorityLane: string | null };
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reseal(value: Record<string, unknown>): void {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  value.contentHash = sha256HexSyncV1(
    canonicalJsonV1(content, 1_048_576),
  );
}

describe("Julia Pixel recovery candidates", () => {
  it("accepts direct and transitive constants but fails closed on unsafe fixtures", () => {
    const byId = new Map(
      JULIA_PIXEL_RECOVERY_FIXTURES_V1.map((fixture) => [fixture.id, fixture]),
    );
    for (const id of ["direct-pixel-constant", "transitive-alpha-renaming"] as const) {
      const fixture = byId.get(id)!;
      const parsed = parseFrmLikeV1(fixture.source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const authority = analyzeJuliaPixelRolesV1(parsed.ir);
      const proposal = proposeJuliaPixelRecoveryCandidateV1(parsed.ir, authority);
      expect(proposal.ok).toBe(true);
      if (proposal.ok) {
        expect(proposal.evidenceClass).toBe("E0-candidate-only");
        expect(proposal.sourceRevision).toMatch(/^[a-f0-9]{64}$/);
        expect(proposal.ir.formulaName).toBe(parsed.ir.formulaName);
        expect(proposal.ir.parameters).toEqual(parsed.ir.parameters);
      }
    }

    for (const id of [
      "mutable-loop-write",
      "component-write",
      "read-then-overwrite",
      "derived-pixel-seed-generalized",
      "literal-recurrence-review",
      "literal-control-rejected",
    ]) {
      const fixture = byId.get(id)!;
      const parsed = parseFrmLikeV1(fixture.source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const proposal = proposeJuliaPixelRecoveryCandidateV1(
        parsed.ir,
        analyzeJuliaPixelRolesV1(parsed.ir),
      );
      expect(proposal.ok).toBe(false);
    }

    const directBailoutSource = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
DirectPixelBailout {
  init:
    z = 0
  loop:
    z = sqr(z) + pixel
  bailout:
    |pixel| <= 64
}
`;
    const directBailout = parseFrmLikeV1(directBailoutSource);
    expect(directBailout.ok).toBe(true);
    if (directBailout.ok) {
      const proposal = proposeJuliaPixelRecoveryCandidateV1(
        directBailout.ir,
        analyzeJuliaPixelRolesV1(directBailout.ir),
      );
      expect(proposal).toEqual({
        ok: false,
        evidenceClass: "fail-closed",
        reasonCode: "constant-target-used-by-bailout",
      });
    }
  });

  it("is invariant under alpha renaming of a transitive constant chain", () => {
    const fixture = JULIA_PIXEL_RECOVERY_FIXTURES_V1.find(
      (value) => value.id === "transitive-alpha-renaming",
    )!;
    const outputs = [fixture.source, fixture.renamedSource!].map((source) => {
      const parsed = parseFrmLikeV1(source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return undefined;
      return proposeJuliaPixelRecoveryCandidateV1(
        parsed.ir,
        analyzeJuliaPixelRolesV1(parsed.ir),
      );
    });
    expect(outputs.every((output) => output?.ok)).toBe(true);
    if (outputs[0]?.ok && outputs[1]?.ok) {
      expect(outputs[1].rewriteKind).toBe(outputs[0].rewriteKind);
      expect(outputs[1].provenanceDepth).toBe(outputs[0].provenanceDepth);
      expect(outputs[1].recurrenceReadCount).toBe(
        outputs[0].recurrenceReadCount,
      );
    }
  });

  it("reconstructs the exact official-census candidate partition", () => {
    const root = process.cwd();
    const runtime = JSON.parse(
      readFileSync(
        join(root, "public/formula-library/v1/runtime/published/index.json"),
        "utf8",
      ),
    ) as {
      rows: { formulaId: string; definitionPath: string }[];
    };
    const census = JSON.parse(
      readFileSync(
        join(root, "resources/formula-library/v1/julia-pixel-role-census.v1.json"),
        "utf8",
      ),
    ) as { rows: CensusRow[] };
    const censusById = new Map(census.rows.map((row) => [row.formulaId, row]));
    const counts = new Map<string, number>();
    for (const runtimeRow of runtime.rows) {
      const row = censusById.get(runtimeRow.formulaId)!;
      if (
        row.authorityEvidence.authorityLane === "existing-system-c" ||
        row.authorityEvidence.authorityLane === "parameter-binding"
      ) {
        counts.set("prior-lane", (counts.get("prior-lane") ?? 0) + 1);
        continue;
      }
      const source = readFileSync(
        join(
          root,
          "public/formula-library/v1/runtime/published",
          runtimeRow.definitionPath,
        ),
        "utf8",
      );
      const parsed = parseFrmLikeV1(source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const proposal = proposeJuliaPixelRecoveryCandidateV1(parsed.ir, row);
      const key = proposal.ok
        ? proposal.rewriteKind === "direct-pixel-constant"
          ? "candidate-direct"
          : `candidate-transitive-depth-${proposal.provenanceDepth}`
        : `held:${proposal.reasonCode}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries([...counts].sort())).toEqual({
      "candidate-direct": 61,
      "candidate-transitive-depth-1": 95,
      "candidate-transitive-depth-2": 3,
      "held:constant-definition-not-unique": 6,
      "held:constant-initialization-control-not-proven": 1,
      "held:constant-role-not-proven": 49,
      "held:constant-role-outside-recurrence": 11,
      "held:generalized-two-plane-held": 27,
      "held:mutable-pixel-alias-held": 30,
      "prior-lane": 251,
    });
  });

  it("strictly parses and freezes the canonical draft asset", () => {
    const parsed = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(Object.isFrozen(parsed.value)).toBe(true);
      expect(Object.isFrozen(parsed.value.rows)).toBe(true);
      expect(Object.isFrozen(parsed.value.rows[0])).toBe(true);
      expect(parsed.value.candidateSetState).toBe("draft-not-wave-frozen");
      expect(parsed.value.waveId).toBeNull();
    }

    const changedCount = clone(candidateAsset) as unknown as Record<
      string,
      unknown
    >;
    (changedCount.counts as Record<string, unknown>).candidateFormulaCount =
      158;
    reseal(changedCount);
    expect(parseJuliaPixelRecoveryCandidatesV1(changedCount).ok).toBe(false);

    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("hostile");
        },
      },
    );
    expect(parseJuliaPixelRecoveryCandidatesV1(hostile).ok).toBe(false);

    const accessor = clone(candidateAsset) as unknown as Record<string, unknown>;
    const schema = accessor.schema;
    Object.defineProperty(accessor, "schema", {
      enumerable: true,
      get: () => schema,
    });
    expect(parseJuliaPixelRecoveryCandidatesV1(accessor).ok).toBe(false);

    const accessorArray = clone(candidateAsset) as unknown as Record<
      string,
      unknown
    >;
    const accessorRows = accessorArray.rows as unknown[];
    const firstRow = accessorRows[0];
    Object.defineProperty(accessorRows, "0", {
      enumerable: true,
      get: () => firstRow,
    });
    expect(parseJuliaPixelRecoveryCandidatesV1(accessorArray).ok).toBe(
      false,
    );

    const symbolArray = clone(candidateAsset) as unknown as Record<
      string,
      unknown
    >;
    Object.defineProperty(symbolArray.rows as unknown[], Symbol("hidden"), {
      value: true,
    });
    expect(parseJuliaPixelRecoveryCandidatesV1(symbolArray).ok).toBe(false);
  });

  it(
    "rejects resealed role-receipt swaps in the independent verifier",
    () => {
      const repo = process.cwd();
      const tampered = clone(candidateAsset) as unknown as Record<
        string,
        unknown
      >;
      const rows = tampered.rows as Record<string, unknown>[];
      const first = rows[0]!;
      const second = rows[1]!;
      [first.roleReceipt, second.roleReceipt] = [
        second.roleReceipt,
        first.roleReceipt,
      ];
      reseal(tampered);
      expect(parseJuliaPixelRecoveryCandidatesV1(tampered).ok).toBe(true);

      const temporary = mkdtempSync(
        join(tmpdir(), "fractalpark-julia-recovery-verifier-"),
      );
      try {
        for (const relative of
          JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1) {
          const destination = join(temporary, relative);
          mkdirSync(dirname(destination), { recursive: true });
          symlinkSync(join(repo, relative), destination, "file");
        }
        const publishedDefinitionSource = join(
          repo,
          "public/formula-library/v1/runtime/published/definitions",
        );
        const publishedDefinitionTarget = join(
          temporary,
          "public/formula-library/v1/runtime/published/definitions",
        );
        symlinkSync(
          publishedDefinitionSource,
          publishedDefinitionTarget,
          "dir",
        );
        const candidateDefinitionTarget = join(
          temporary,
          "resources/formula-library/v1",
          JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
        );
        cpSync(
          join(
            repo,
            "resources/formula-library/v1",
            JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
          ),
          candidateDefinitionTarget,
          { recursive: true },
        );
        const assetTarget = join(
          temporary,
          "resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json",
        );
        writeFileSync(
          assetTarget,
          `${JSON.stringify(tampered, null, 2)}\n`,
        );
        const runVerifier = () =>
          execFileSync(
            join(repo, "node_modules/.bin/tsx"),
            [join(repo, "scripts/verify-julia-pixel-recovery-candidates.ts")],
            { cwd: temporary, stdio: "pipe" },
          );
        expect(runVerifier).toThrow();

        writeFileSync(
          assetTarget,
          `${JSON.stringify(candidateAsset, null, 2)}\n`,
        );
        const candidateRevision = (
          candidateAsset.rows.find((row) => row.status === "candidate") as {
            candidate: { sourceRevision: string };
          }
        ).candidate.sourceRevision;
        const definitionName = `${candidateRevision}.frm`;
        const definitionSource = join(
          repo,
          "resources/formula-library/v1",
          JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1,
          definitionName,
        );
        const definitionTarget = join(
          candidateDefinitionTarget,
          definitionName,
        );
        rmSync(definitionTarget);
        symlinkSync(definitionSource, definitionTarget, "file");
        expect(runVerifier).toThrow();

        rmSync(definitionTarget);
        cpSync(definitionSource, definitionTarget);
        rmSync(assetTarget);
        symlinkSync(
          join(
            repo,
            "resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json",
          ),
          assetTarget,
          "file",
        );
        expect(runVerifier).toThrow();
        expect(() =>
          execFileSync(
            join(repo, "node_modules/.bin/tsx"),
            [
              join(repo, "scripts/build-julia-pixel-recovery-candidates.ts"),
              "--write",
            ],
            { cwd: temporary, stdio: "pipe" },
          ),
        ).toThrow();
        expect(
          readdirSync(join(temporary, "resources/formula-library/v1")).filter(
            (name) => name.includes(".tmp-"),
          ),
        ).toEqual([]);
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
