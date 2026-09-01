import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import evidenceAsset from "../../resources/formula-library/v1/julia-parameter-binding-evidence.v1.json";
import existingSystemCEvidence from "../../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import {
  canonicalizeFrmLikeV1,
  parseFrmLikeV1,
} from "@/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "@/engine/frm/frm-v1-stdlib";
import {
  classifyJuliaBindingRolesV1,
  type JuliaBindingClassifierReasonV1,
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
import {
  validateFormulaSafetyEnvelopeV1,
  type SafetyEnvelopeFailureV1,
} from "@/engine/formulas/v1/safety-envelope";

interface StaticRejectedAttempt {
  slotName: string;
  status: "static-rejected";
  reasonCode: JuliaBindingClassifierReasonV1;
}

interface Tier1Attempt {
  slotName: string;
  status: "tier1-candidate" | "blocked";
  bindingRevision: string;
  contract: JuliaBindingContractV1;
  checks: {
    parameterPlaneBitIdentical: boolean;
    deterministic: boolean;
    finiteEvidence: boolean;
    pixelSensitive: boolean;
    constantSensitive: boolean;
  };
  reasonCodes: string[];
}

type SlotAttempt = StaticRejectedAttempt | Tier1Attempt;

interface EvidenceRow {
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  rightsStatus: string;
  publicationDecision: "publish";
  implementationBasis: string;
  leakageScanStatus: "passed";
  tier0:
    | {
        status: "passed";
        sourceBound: true;
        rightsBound: true;
        safetyEnvelope: true;
      }
    | {
        status: "blocked";
        sourceBound: true;
        rightsBound: true;
        safetyEnvelope: false;
        failureCode: SafetyEnvelopeFailureV1;
        canonicalSourceDelta: "terminal-newline-only" | "other";
      }
    | {
        status: "not-required";
        reasonCode: "no-static-parameter-candidate";
      };
  complexSlotCount: number;
  attempts: SlotAttempt[];
  slotResolution:
    | {
        status: "single-passing-slot";
        selectedSlotName: string;
        selectedBindingRevision: string;
        modeClass: "classic-julia" | "generalized-two-plane";
      }
    | { status: "multiple-passing-slots"; passingSlotNames: string[] }
    | {
        status: "no-passing-slot";
        reasonCode: "no-complex-parameter" | "all-parameter-slots-rejected";
      };
  adjudication:
    | {
        status: "candidate-only";
        selectedSlotName: string;
        selectedBindingRevision: string;
        modeClass: "classic-julia" | "generalized-two-plane";
      }
    | {
        status: "blocked";
        reasonCode:
          | "tier0-safety-envelope-rejected"
          | "multiple-passing-parameter-slots"
          | "no-passing-parameter-slot";
      }
    | {
        status: "not-selected";
        reasonCode: "no-static-parameter-candidate";
      };
}

interface EvidenceAsset {
  schema: "fractalpark-julia-parameter-binding-evidence/v1";
  revision: 1;
  stage: "tier0-tier1-pre-gpu";
  runtimeIndexCanonicalSha256: string;
  publicationDecisionsContentHash: string;
  existingSystemCEvidenceContentHash: string;
  numericProfile: "standard32";
  sourceBindings: Record<string, string>;
  formulaCount: number;
  formulasWithComplexParameter: number;
  complexSlotCount: number;
  staticRejectedSlotCount: number;
  staticCandidateSlotCount: number;
  staticCandidateFormulaCount: number;
  tier1CandidateSlotCount: number;
  tier1BlockedSlotCount: number;
  singlePassingSlotFormulaCount: number;
  classicSinglePassingSlotFormulaCount: number;
  generalizedSinglePassingSlotFormulaCount: number;
  multiplePassingSlotFormulaCount: number;
  noPassingSlotFormulaCount: number;
  tier0PassedFormulaCount: number;
  tier0BlockedFormulaCount: number;
  terminalNewlineOnlyFormulaCount: number;
  otherCanonicalDeltaFormulaCount: number;
  eligibleCandidateCount: number;
  blockedFormulaCount: number;
  notSelectedFormulaCount: number;
  tier0FailureCounts: Record<string, number>;
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
const EVIDENCE_CANONICAL_NODE_BUDGET = 65_536;
const EXPECTED_SOURCE_BINDING_PATHS = [
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
  "resources/formula-library/v1/legacy-formula-aliases.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/standard-formula-ids.json",
  "scripts/build-julia-parameter-binding-evidence.ts",
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

function bindingRevision(
  formulaId: string,
  sourceRevision: string,
  contract: JuliaBindingContractV1,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1({
      schema: BINDING_SCHEMA,
      formulaId,
      sourceRevision,
      binding: contract.binding,
      modeClass: contract.modeClass,
      supportLane: contract.supportLane,
      z0Role: contract.z0Role,
    }),
  );
}

function expectedSlotResolution(attempts: readonly SlotAttempt[]) {
  const passing = attempts.filter(
    (attempt): attempt is Tier1Attempt => attempt.status === "tier1-candidate",
  );
  if (passing.length === 1) {
    const selected = passing[0]!;
    return {
      status: "single-passing-slot",
      selectedSlotName: selected.slotName,
      selectedBindingRevision: selected.bindingRevision,
      modeClass: selected.contract.modeClass,
    };
  }
  if (passing.length > 1)
    return {
      status: "multiple-passing-slots",
      passingSlotNames: passing.map((attempt) => attempt.slotName),
    };
  return {
    status: "no-passing-slot",
    reasonCode:
      attempts.length === 0
        ? "no-complex-parameter"
        : "all-parameter-slots-rejected",
  };
}

describe("parameter-binding Julia Tier 0-1 evidence", () => {
  it("freezes the exact 534-row decision surface without promoting the live census", () => {
    expect(artifact).toMatchObject({
      schema: "fractalpark-julia-parameter-binding-evidence/v1",
      revision: 1,
      stage: "tier0-tier1-pre-gpu",
      runtimeIndexCanonicalSha256:
        PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
      publicationDecisionsContentHash:
        PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
      existingSystemCEvidenceContentHash: existingSystemCEvidence.contentHash,
      numericProfile: "standard32",
      formulaCount: 534,
      formulasWithComplexParameter: 293,
      complexSlotCount: 371,
      staticRejectedSlotCount: 185,
      staticCandidateSlotCount: 186,
      staticCandidateFormulaCount: 175,
      tier1CandidateSlotCount: 170,
      tier1BlockedSlotCount: 16,
      singlePassingSlotFormulaCount: 162,
      classicSinglePassingSlotFormulaCount: 107,
      generalizedSinglePassingSlotFormulaCount: 55,
      multiplePassingSlotFormulaCount: 4,
      noPassingSlotFormulaCount: 368,
      tier0PassedFormulaCount: 0,
      tier0BlockedFormulaCount: 175,
      terminalNewlineOnlyFormulaCount: 163,
      otherCanonicalDeltaFormulaCount: 12,
      eligibleCandidateCount: 0,
      blockedFormulaCount: 175,
      notSelectedFormulaCount: 359,
      tier0FailureCounts: { "source-not-canonical": 175 },
    });
    expect(artifact.probeGrid.points).toHaveLength(3);
    expect(artifact.probeGrid.constants).toHaveLength(3);
    expect(artifact.probeGrid.depths).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128,
    ]);
    expect(artifact.rows).toHaveLength(534);
    expect(new Set(artifact.rows.map((row) => row.formulaId)).size).toBe(534);
    expect(
      artifact.rows.every(
        (row, index) =>
          index === 0 || artifact.rows[index - 1]!.formulaId < row.formulaId,
      ),
    ).toBe(true);
    expect(Object.keys(artifact.sourceBindings)).toEqual(
      EXPECTED_SOURCE_BINDING_PATHS,
    );
    for (const relativePath of EXPECTED_SOURCE_BINDING_PATHS) {
      expect(artifact.sourceBindings[relativePath]).toBe(
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      );
    }
    const unhashed = structuredClone(artifact) as EvidenceAsset;
    delete (unhashed as Partial<EvidenceAsset>).contentHash;
    expect(
      sha256HexSyncV1(
        canonicalJsonV1(unhashed, EVIDENCE_CANONICAL_NODE_BUDGET),
      ),
    ).toBe(artifact.contentHash);
    expect(JULIA_CAPABILITY_CENSUS_V1.rows).toHaveLength(534);
    expect(
      JULIA_CAPABILITY_CENSUS_V1.rows.every((row) => row.status === "unknown"),
    ).toBe(true);
  });

  it("independently replays every complex slot, Tier 0 result, and binding digest", async () => {
    const parsedIndex = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
    );
    expect(parsedIndex.ok).toBe(true);
    if (!parsedIndex.ok) return;
    const publication = createPublicationDecisionLedgerV1();
    expect(publication.ok).toBe(true);
    if (!publication.ok) return;

    const rowById = new Map(
      artifact.rows.map((row) => [row.formulaId, row] as const),
    );
    const existingIds = new Set(
      existingSystemCEvidence.rows.map((row) => row.formulaId),
    );
    const points = pairGrid(artifact.probeGrid.points);
    const constants = pairGrid(artifact.probeGrid.constants);

    for (const runtimeRow of parsedIndex.value.rows) {
      const row = rowById.get(runtimeRow.formulaId);
      expect(row).toBeDefined();
      if (!row) continue;
      const source = readFileSync(
        join(PUBLISHED_ROOT, runtimeRow.definitionPath),
        "utf8",
      );
      const parsed = parseFrmLikeV1(source);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(row.sourceRevision).toBe(runtimeRow.sourceRevision);
      expect(row.semanticHash).toBe(runtimeRow.semanticHash);
      const decision = publication.ledger.decisionFor(runtimeRow.formulaId);
      expect(decision).toBeDefined();
      expect(row).toMatchObject({
        rightsStatus: decision?.rightsStatus,
        publicationDecision: decision?.publicationDecision,
        implementationBasis: decision?.implementationBasis,
        leakageScanStatus: decision?.leakageScanStatus,
      });

      const complexSlots = parsed.ir.parameters
        .filter((parameter) => parameter.type === "complex")
        .map((parameter) => parameter.name);
      expect(row.complexSlotCount).toBe(complexSlots.length);
      expect(row.attempts.map((attempt) => attempt.slotName)).toEqual(
        complexSlots,
      );
      const parameters = runtimeParameters(runtimeRow.parameters);
      const replayedAttempts: SlotAttempt[] = [];
      for (const slotName of complexSlots) {
        const binding = { kind: "parameter", slotName } as const;
        const classified = classifyJuliaBindingRolesV1(parsed.ir, binding);
        if (!classified.ok) {
          replayedAttempts.push({
            slotName,
            status: "static-rejected",
            reasonCode: classified.reasonCode,
          });
          continue;
        }
        const harness = runJuliaCpuHarnessV1(parsed.ir, binding, {
          points,
          constants,
          depths: artifact.probeGrid.depths,
          parameters,
        });
        expect(harness.ok).toBe(true);
        if (!harness.ok) continue;
        replayedAttempts.push({
          slotName,
          status: harness.value.candidatePass ? "tier1-candidate" : "blocked",
          bindingRevision: bindingRevision(
            runtimeRow.formulaId,
            runtimeRow.sourceRevision,
            harness.value.contract,
          ),
          contract: harness.value.contract,
          checks: harness.value.checks,
          reasonCodes: [...harness.value.reasonCodes],
        });
      }
      expect(row.attempts).toEqual(replayedAttempts);
      const staticCandidates = replayedAttempts.filter(
        (attempt) => attempt.status !== "static-rejected",
      );
      if (staticCandidates.length === 0) {
        expect(row.tier0).toEqual({
          status: "not-required",
          reasonCode: "no-static-parameter-candidate",
        });
        expect(row.adjudication).toEqual({
          status: "not-selected",
          reasonCode: "no-static-parameter-candidate",
        });
      } else {
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
        expect(safety).toEqual({ ok: false, code: "source-not-canonical" });
        expect(row.tier0).toEqual({
          status: "blocked",
          sourceBound: true,
          rightsBound: true,
          safetyEnvelope: false,
          failureCode: "source-not-canonical",
          canonicalSourceDelta:
            source === `${canonicalizeFrmLikeV1(parsed.ir)}\n`
              ? "terminal-newline-only"
              : "other",
        });
        expect(row.adjudication).toEqual({
          status: "blocked",
          reasonCode: "tier0-safety-envelope-rejected",
        });
      }
      const slotResolution = expectedSlotResolution(replayedAttempts);
      expect(row.slotResolution).toEqual(slotResolution);
      if (slotResolution.status !== "no-passing-slot")
        expect(existingIds.has(runtimeRow.formulaId)).toBe(false);
    }

    expect(artifact.rows.map((row) => row.formulaId)).toEqual(
      parsedIndex.value.rows.map((row) => row.formulaId),
    );
  }, 180_000);
});
