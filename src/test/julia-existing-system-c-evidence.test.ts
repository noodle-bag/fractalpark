import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import evidenceAsset from "../../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import { parseFrmLikeV1 } from "@/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "@/engine/frm/frm-v1-stdlib";
import {
  classifyJuliaBindingRolesV1,
  type JuliaBindingContractV1,
} from "@/engine/formulas/v1/julia-binding";
import {
  runJuliaCpuHarnessV1,
  type JuliaCpuComplexV1,
} from "@/engine/formulas/v1/julia-cpu-harness";
import { JULIA_CAPABILITY_CENSUS_V1 } from "@/engine/formulas/v1/julia-capability";
import { createPublicationDecisionLedgerV1 } from "@/engine/formulas/v1/publication-decisions";
import type { PublishedFormulaParameterDescriptorV1 } from "@/engine/formulas/v1/published-adapter";
import {
  parsePublishedFormulaRuntimeIndexV1,
  PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
} from "@/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "@/engine/formulas/v1/safety-envelope";

interface EvidenceRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  bindingRevision: string;
  rightsStatus: string;
  publicationDecision: "publish";
  implementationBasis: string;
  leakageScanStatus: "passed";
  contract: JuliaBindingContractV1;
  tier0: {
    sourceBound: true;
    rightsBound: true;
    safetyEnvelope: true;
  };
  tier1: {
    evidenceClass: "tier1-candidate-only";
    status: "tier1-candidate" | "blocked";
    checks: {
      parameterPlaneBitIdentical: boolean;
      deterministic: boolean;
      finiteEvidence: boolean;
      pixelSensitive: boolean;
      constantSensitive: boolean;
    };
    reasonCodes: string[];
  };
}

interface EvidenceAsset {
  schema: "fractalpark-julia-existing-system-c-evidence/v1";
  revision: 1;
  stage: "tier0-tier1-pre-gpu";
  runtimeIndexCanonicalSha256: string;
  publicationDecisionsContentHash: string;
  numericProfile: "standard32";
  sourceBindings: Record<string, string>;
  candidateCount: number;
  tier1PassCount: number;
  tier1BlockedCount: number;
  probeGrid: {
    points: number[][];
    constants: number[][];
    depths: number[];
  };
  rows: EvidenceRow[];
  contentHash: string;
}

const artifact = evidenceAsset as EvidenceAsset;
const ROOT = process.cwd();
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const PUBLISHED_ROOT = join(
  ROOT,
  "public/formula-library/v1/runtime/published",
);
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1";
const EXPECTED_SOURCE_BINDING_PATHS = [
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/legacy-formula-aliases.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/standard-formula-ids.json",
  "scripts/build-julia-existing-system-c-evidence.ts",
  "src/engine/formulas/v1/identity.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-capability.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/publication-decisions.ts",
  "src/engine/formulas/v1/published-adapter.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/safety-envelope.ts",
  "src/engine/formulas/v1/standard-manifest.ts",
  "src/engine/formulas/v1/types.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/v1.ts",
  "src/engine/plugins/types.ts",
  "tsconfig.json",
] as const;

function runtimeParameters(
  parameters: readonly PublishedFormulaParameterDescriptorV1[],
): Readonly<
  Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>
> {
  const result: Record<
    string,
    number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName
  > = {};
  for (const parameter of parameters) {
    if (parameter.type === "function") {
      result[parameter.slotName] = parameter.default as FrmV1UnaryFunctionName;
    } else if (parameter.type === "complex") {
      const value = parameter.default as readonly [number, number];
      result[parameter.slotName] = [value[0], value[1]];
    } else {
      result[parameter.slotName] = parameter.default as number;
    }
  }
  return result;
}

function pairGrid(values: number[][]): JuliaCpuComplexV1[] {
  return values.map((value) => {
    expect(value).toHaveLength(2);
    return [value[0]!, value[1]!] as const;
  });
}

function bindingRevision(row: EvidenceRow): string {
  return sha256HexSyncV1(
    canonicalJsonV1({
      schema: BINDING_SCHEMA,
      formulaId: row.formulaId,
      sourceRevision: row.sourceRevision,
      binding: row.contract.binding,
      modeClass: row.contract.modeClass,
      supportLane: row.contract.supportLane,
      z0Role: row.contract.z0Role,
    }),
  );
}

describe("existing-system-c Julia Tier 0-1 evidence", () => {
  it("freezes an exact pre-GPU fixture without promoting the live census", () => {
    expect(artifact).toMatchObject({
      schema: "fractalpark-julia-existing-system-c-evidence/v1",
      revision: 1,
      stage: "tier0-tier1-pre-gpu",
      runtimeIndexCanonicalSha256:
        PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
      publicationDecisionsContentHash:
        PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
      numericProfile: "standard32",
      candidateCount: 76,
      tier1PassCount: 74,
      tier1BlockedCount: 2,
    });
    expect(artifact.probeGrid.points).toHaveLength(3);
    expect(artifact.probeGrid.constants).toHaveLength(3);
    expect(artifact.probeGrid.depths).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128,
    ]);
    expect(artifact.rows).toHaveLength(76);
    expect(Object.keys(artifact.sourceBindings)).toEqual(
      EXPECTED_SOURCE_BINDING_PATHS,
    );
    for (const relativePath of EXPECTED_SOURCE_BINDING_PATHS) {
      expect(artifact.sourceBindings[relativePath]).toBe(
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      );
    }
    expect(new Set(artifact.rows.map((row) => row.formulaId)).size).toBe(76);
    expect(
      artifact.rows.every(
        (row, index) =>
          index === 0 || artifact.rows[index - 1]!.formulaId < row.formulaId,
      ),
    ).toBe(true);
    expect(
      artifact.rows.filter((row) => row.tier1.status === "tier1-candidate"),
    ).toHaveLength(74);
    expect(
      artifact.rows.filter((row) => row.tier1.status === "blocked"),
    ).toHaveLength(2);

    const unhashed = structuredClone(artifact) as EvidenceAsset;
    delete (unhashed as Partial<EvidenceAsset>).contentHash;
    expect(sha256HexSyncV1(canonicalJsonV1(unhashed))).toBe(
      artifact.contentHash,
    );
    expect(JULIA_CAPABILITY_CENSUS_V1.rows).toHaveLength(534);
    expect(
      JULIA_CAPABILITY_CENSUS_V1.rows.every((row) => row.status === "unknown"),
    ).toBe(true);
  });

  it("independently replays source, rights, Safety Envelope, and Tier 1", async () => {
    const parsedIndex = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
    );
    expect(parsedIndex.ok).toBe(true);
    if (!parsedIndex.ok) return;
    const publication = createPublicationDecisionLedgerV1();
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;

    const staticCandidateIds: string[] = [];
    const artifactById = new Map(
      artifact.rows.map((row) => [row.formulaId, row] as const),
    );
    const points = pairGrid(artifact.probeGrid.points);
    const constants = pairGrid(artifact.probeGrid.constants);

    for (const runtimeRow of parsedIndex.value.rows) {
      const source = readFileSync(
        join(PUBLISHED_ROOT, runtimeRow.definitionPath),
        "utf8",
      );
      const parsed = parseFrmLikeV1(source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const classified = classifyJuliaBindingRolesV1(parsed.ir, {
        kind: "system-c",
      });
      if (!classified.ok) continue;
      staticCandidateIds.push(runtimeRow.formulaId);

      const row = artifactById.get(runtimeRow.formulaId);
      expect(row).toBeDefined();
      if (!row) continue;
      expect(row.sourceRevision).toBe(runtimeRow.sourceRevision);
      expect(row.semanticHash).toBe(runtimeRow.semanticHash);
      expect(classified.contract).toMatchObject({
        binding: { kind: "system-c" },
        modeClass: "classic-julia",
        supportLane: "existing-system-c",
        z0Role: "pixel-seed",
      });

      const decision = publication.ledger.decisionFor(runtimeRow.formulaId);
      expect(decision).toBeDefined();
      expect(row).toMatchObject({
        rightsStatus: decision?.rightsStatus,
        publicationDecision: decision?.publicationDecision,
        implementationBasis: decision?.implementationBasis,
        leakageScanStatus: decision?.leakageScanStatus,
        tier0: {
          sourceBound: true,
          rightsBound: true,
          safetyEnvelope: true,
        },
      });

      const safety = await validateFormulaSafetyEnvelopeV1({
        schemaVersion: 1,
        source,
        sourceRevision: runtimeRow.sourceRevision,
        semanticHash: runtimeRow.semanticHash,
        languageVersion: "frm-like/1",
        stdlibVersion: 1,
        supportedNumericProfiles: ["standard32"],
        parameters: parsed.ir.parameters,
        programModel: "orbit",
        termination: {
          predicateMeaning: "continue-iteration",
          nonFinite: "terminate-with-event",
          maximumIterations: "profile-resolved",
        },
        channels: [],
        capabilities: [],
      });
      expect(safety.ok).toBe(true);

      const replay = runJuliaCpuHarnessV1(parsed.ir, { kind: "system-c" }, {
        points,
        constants,
        depths: artifact.probeGrid.depths,
        parameters: runtimeParameters(runtimeRow.parameters),
      });
      expect(replay.ok).toBe(true);
      if (!replay.ok) continue;
      expect(row.contract).toEqual(replay.value.contract);
      expect(row.bindingRevision).toBe(bindingRevision(row));
      expect(row.tier1).toEqual({
        evidenceClass: replay.value.evidenceClass,
        status: replay.value.candidatePass ? "tier1-candidate" : "blocked",
        checks: replay.value.checks,
        reasonCodes: replay.value.reasonCodes,
      });
    }

    expect(staticCandidateIds).toEqual(
      artifact.rows.map((row) => row.formulaId),
    );
  }, 120_000);
});
