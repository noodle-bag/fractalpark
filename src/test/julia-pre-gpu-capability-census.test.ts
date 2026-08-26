import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import liveCensusAsset from "../../resources/formula-library/v1/julia-capability-census.v1.json";
import existingEvidenceAsset from "../../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import parameterEvidenceAsset from "../../resources/formula-library/v1/julia-parameter-binding-evidence.v1.json";
import preGpuAsset from "../../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import sourceSplitEvidenceAsset from "../../resources/formula-library/v1/julia-source-split-evidence.v1.json";
import type { JuliaBindingContractV1 } from "@/engine/formulas/v1/julia-binding";
import {
  JULIA_PRE_GPU_CAPABILITY_CENSUS_V1,
  parseJuliaPreGpuCapabilityCensusV1,
} from "@/engine/formulas/v1/julia-pre-gpu-capability";
import {
  parsePublishedFormulaRuntimeIndexV1,
  PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
} from "@/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "@/engine/formulas/v1/revisions";

interface ExistingRow {
  formulaId: string;
  tier1: { status: "tier1-candidate" | "blocked" };
}
interface ExistingEvidence {
  contentHash: string;
  rows: ExistingRow[];
}
interface ParameterRow {
  formulaId: string;
  tier0: { status: "passed" | "blocked" | "not-required" };
}
interface ParameterEvidence {
  contentHash: string;
  rows: ParameterRow[];
}
type SourceSplitRow =
  | {
      formulaId: string;
      status: "prior-lane";
      priorLane: "existing-system-c" | "parameter-binding";
    }
  | {
      formulaId: string;
      status: "not-selected";
      reasonCode:
        | "julia-source-split-no-mechanical-role"
        | "julia-source-split-mutable-pixel-alias";
    }
  | {
      formulaId: string;
      status: "candidate-only" | "blocked";
      identity: {
        candidateSourceRevision: string;
        candidateSemanticHash: string;
      };
      isolation: { candidateDefinitionPath?: string };
      tier1: { candidatePass: boolean };
    };
interface SourceSplitEvidence {
  contentHash: string;
  rows: SourceSplitRow[];
}

const ROOT = process.cwd();
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const CANDIDATE_ROOT = join(
  ROOT,
  "resources/formula-library/v1/julia-source-split-candidates/definitions",
);
const CANONICAL_NODE_BUDGET = 131_072;
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1";
const EXPECTED_ROW_MAP_CONTENT_HASH =
  "4422b87a471ed33134c8af448fe393d39fd5c05466a0bea76e22a09ce6d3f480";
const EXPECTED_AUTHORITY_CONTENT_HASH =
  "ed34606d0f7dea0cfe8f65e92a3edaac3d391c15bf094e764487d2caebb179c0";
const EXPECTED_SOURCE_BINDING_PATHS = [
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
  "resources/formula-library/v1/julia-parameter-binding-evidence.v1.json",
  "resources/formula-library/v1/julia-source-split-evidence.v1.json",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-capability.ts",
  "src/engine/formulas/v1/julia-source-split.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "tsconfig.json",
] as const;

const existing = existingEvidenceAsset as ExistingEvidence;
const parameter = parameterEvidenceAsset as ParameterEvidence;
const sourceSplit = sourceSplitEvidenceAsset as SourceSplitEvidence;
const artifact = JULIA_PRE_GPU_CAPABILITY_CENSUS_V1;

function cloneAsset(): Record<string, unknown> {
  return structuredClone(preGpuAsset) as Record<string, unknown>;
}

function rehashAsset(asset: Record<string, unknown>): Record<string, unknown> {
  const content = Object.fromEntries(
    Object.entries(asset).filter(([key]) => key !== "contentHash"),
  );
  asset.contentHash = sha256HexSyncV1(
    canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
  );
  return asset;
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

function rowMapContentHash(rows: readonly Record<string, unknown>[]): string {
  const projection = rows.map((row) => ({
    formulaId: row.formulaId,
    baselineSourceRevision: row.baselineSourceRevision,
    evaluatedSourceRevision: row.evaluatedSourceRevision,
    evaluatedSemanticHash: row.evaluatedSemanticHash,
    status: row.status,
    disposition: row.disposition,
    lane: row.lane,
    modeClass: row.modeClass,
    contract: row.contract,
    bindingRevision: row.bindingRevision,
    attemptedStages: row.attemptedStages,
    nextRequiredEvidence: row.nextRequiredEvidence,
    notApplicableReview: row.notApplicableReview,
  }));
  return sha256HexSyncV1(
    canonicalJsonV1(projection, CANONICAL_NODE_BUDGET),
  );
}

function authorityContentHash(value: Record<string, unknown>): string {
  return sha256HexSyncV1(
    canonicalJsonV1(
      {
        runtimeIndexCanonicalSha256: value.runtimeIndexCanonicalSha256,
        liveCensusContentHash: value.liveCensusContentHash,
        publicationDecisionsContentHash: value.publicationDecisionsContentHash,
        evidenceContentHashes: value.evidenceContentHashes,
        sourceBindings: value.sourceBindings,
      },
      CANONICAL_NODE_BUDGET,
    ),
  );
}

describe("Julia pre-GPU capability closure", () => {
  it("freezes a zero-candidate, zero-supported exact-534 closure", () => {
    expect(artifact).toMatchObject({
      schema: "fractalpark-julia-pre-gpu-capability-census/v1",
      revision: 1,
      stage: "pre-gpu-closure",
      activationStatus: "inactive-evidence-only",
      runtimeIndexCanonicalSha256:
        PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
      liveCensusContentHash: liveCensusAsset.contentHash,
      publicationDecisionsContentHash:
        PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
      evidenceContentHashes: {
        existingSystemC: existing.contentHash,
        parameterBinding: parameter.contentHash,
        sourceSplit: sourceSplit.contentHash,
      },
      authorityContentHash: EXPECTED_AUTHORITY_CONTENT_HASH,
      rowMapContentHash: EXPECTED_ROW_MAP_CONTENT_HASH,
      rowCount: 534,
      statusCounts: {
        supported: 0,
        candidate: 0,
        notApplicable: 0,
        unknown: 334,
        blocked: 200,
      },
      preGpuReadyCounts: {
        total: 185,
        classic: 185,
        generalized: 0,
        existingSystemC: 74,
        parameterBinding: 0,
        sourceSplit: 111,
      },
      blockedCounts: {
        total: 200,
        existingSystemCTier1: 2,
        parameterBindingTier0: 175,
        sourceSplitTier1: 6,
        sourceSplitMutableAlias: 17,
      },
      enhancementValidation: {
        sourceSplitCandidateCount: 111,
        validatedCandidateCount: 111,
        rejectedCandidateCount: 0,
        candidateDefinitionsExactSet: true,
      },
      notApplicableReviewPolicy: {
        requiredDecisions: ["technical-author", "independent-reviewer"],
        reviewedRowCount: 149,
        acceptedCount: 0,
        inconclusiveCount: 149,
      },
    });
    expect(artifact.rows).toHaveLength(534);
    expect(
      rowMapContentHash(
        artifact.rows as unknown as readonly Record<string, unknown>[],
      ),
    ).toBe(EXPECTED_ROW_MAP_CONTENT_HASH);
    expect(
      authorityContentHash(artifact as unknown as Record<string, unknown>),
    ).toBe(EXPECTED_AUTHORITY_CONTENT_HASH);
    expect(artifact.rows.map((row) => row.formulaId)).toEqual(
      [...artifact.rows.map((row) => row.formulaId)].sort(),
    );
    expect(new Set(artifact.rows.map((row) => row.formulaId)).size).toBe(534);
    expect(
      artifact.rows.some(
        (row) =>
          row.status === ("candidate" as typeof row.status) ||
          row.status === ("supported" as typeof row.status),
      ),
    ).toBe(false);
    expect(
      artifact.rows.some(
        (row) =>
          row.contract !== null &&
          Object.hasOwn(row.contract, "candidateKind"),
      ),
    ).toBe(false);
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(Object.isFrozen(artifact.rows)).toBe(true);
    expect(Object.isFrozen(artifact.rows[0])).toBe(true);
    expect(
      Object.isFrozen(
        artifact.rows.find((row) => row.contract !== null)?.contract,
      ),
    ).toBe(true);
  });

  it("keeps the live census fail-closed and unwired", () => {
    expect(liveCensusAsset.rows).toHaveLength(534);
    expect(liveCensusAsset.rows.every((row) => row.status === "unknown")).toBe(
      true,
    );
    expect(
      liveCensusAsset.rows.filter((row) => row.status !== "unknown"),
    ).toEqual([]);
    expect(artifact.activationStatus).toBe("inactive-evidence-only");
  });

  it("independently closes every row from the ordered lane evidence", () => {
    const runtime = parsePublishedFormulaRuntimeIndexV1(
      JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
    );
    expect(runtime.ok).toBe(true);
    if (!runtime.ok) return;

    const runtimeById = new Map(
      runtime.value.rows.map((row) => [row.formulaId, row]),
    );
    const existingById = new Map(
      existing.rows.map((row) => [row.formulaId, row]),
    );
    const parameterById = new Map(
      parameter.rows.map((row) => [row.formulaId, row]),
    );
    const parameterIds = new Set(
      parameter.rows
        .filter((row) => row.tier0.status !== "not-required")
        .map((row) => row.formulaId),
    );
    const sourceById = new Map(
      sourceSplit.rows.map((row) => [row.formulaId, row]),
    );

    expect(existingById.size).toBe(76);
    expect(parameterIds.size).toBe(175);
    expect(
      [...existingById.keys()].every((formulaId) => !parameterIds.has(formulaId)),
    ).toBe(true);

    for (const row of artifact.rows) {
      const runtimeRow = runtimeById.get(row.formulaId);
      expect(runtimeRow, row.formulaId).toBeDefined();
      expect(row.baselineSourceRevision).toBe(runtimeRow?.sourceRevision);

      const existingRow = existingById.get(row.formulaId);
      if (existingRow) {
        expect(row.lane).toBe("existing-system-c");
        expect(row.evidenceContentHash).toBe(existing.contentHash);
        expect(row.disposition).toBe(
          existingRow.tier1.status === "tier1-candidate"
            ? "tier2-pending"
            : "existing-system-c-tier1-blocked",
        );
        continue;
      }

      if (parameterIds.has(row.formulaId)) {
        expect(parameterById.get(row.formulaId)).toBeDefined();
        expect(row.lane).toBe("parameter-binding");
        expect(row.status).toBe("blocked");
        expect(row.disposition).toBe(
          "parameter-binding-tier0-source-blocked",
        );
        expect(row.evidenceContentHash).toBe(parameter.contentHash);
        continue;
      }

      const sourceRow = sourceById.get(row.formulaId);
      expect(sourceRow, row.formulaId).toBeDefined();
      expect(sourceRow?.status).not.toBe("prior-lane");
      expect(row.evidenceContentHash).toBe(sourceSplit.contentHash);
      if (!sourceRow || sourceRow.status === "prior-lane") continue;
      if (sourceRow.status === "candidate-only") {
        expect(row).toMatchObject({
          status: "unknown",
          disposition: "tier2-pending",
          lane: "source-split",
          evaluatedSourceRevision:
            sourceRow.identity.candidateSourceRevision,
          evaluatedSemanticHash: sourceRow.identity.candidateSemanticHash,
          nextRequiredEvidence: "tier2-webgl-parity",
        });
        continue;
      }
      if (sourceRow.status === "blocked") {
        expect(row).toMatchObject({
          status: "blocked",
          disposition: "source-split-tier1-blocked",
          lane: "source-split",
          evaluatedSourceRevision:
            sourceRow.identity.candidateSourceRevision,
          nextRequiredEvidence: "source-split-remediation-or-revision",
        });
        continue;
      }
      expect("reasonCode" in sourceRow).toBe(true);
      if (
        "reasonCode" in sourceRow &&
        sourceRow.reasonCode === "julia-source-split-mutable-pixel-alias"
      ) {
        expect(row).toMatchObject({
          status: "blocked",
          disposition: "source-split-mutable-alias-blocked",
          lane: "none",
          nextRequiredEvidence: "source-split-remediation-or-revision",
        });
        continue;
      }
      expect(row).toMatchObject({
        status: "unknown",
        disposition: "not-applicable-review-inconclusive",
        lane: "none",
        nextRequiredEvidence: "independent-review-or-identity-analysis",
        notApplicableReview: {
          technicalAuthorDecision: "inconclusive",
          independentReviewerDecision:
            "required-for-terminal-not-applicable",
          reasonCode: "fixed-literal-or-identity-change-not-exhausted",
        },
      });
    }
  });

  it("validates the exact isolated source-split Definition set by content hash", () => {
    const expected = artifact.rows
      .filter(
        (row) =>
          row.disposition === "tier2-pending" && row.lane === "source-split",
      )
      .map((row) => `${row.evaluatedSourceRevision}.frm`)
      .sort();
    const actual = readdirSync(CANDIDATE_ROOT)
      .filter((name) => name.endsWith(".frm"))
      .sort();
    expect(actual).toEqual(expected);
    expect(actual).toHaveLength(111);
    for (const name of actual) {
      expect(
        `${sha256HexSyncV1(readFileSync(join(CANDIDATE_ROOT, name), "utf8"))}.frm`,
      ).toBe(name);
    }
  });

  it("binds every declared source and verifies the self hash", () => {
    expect(Object.keys(artifact.sourceBindings).sort()).toEqual(
      [...EXPECTED_SOURCE_BINDING_PATHS].sort(),
    );
    for (const relativePath of EXPECTED_SOURCE_BINDING_PATHS) {
      expect(artifact.sourceBindings[relativePath], relativePath).toBe(
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      );
    }
    const content = Object.fromEntries(
      Object.entries(artifact).filter(([key]) => key !== "contentHash"),
    );
    expect(
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET)),
    ).toBe(artifact.contentHash);
  });

  it("fails closed on candidate, review, ordering, and self-hash tampering", () => {
    const candidate = cloneAsset();
    const candidateRows = candidate.rows as Array<Record<string, unknown>>;
    candidateRows[0]!.status = "candidate";
    expect(parseJuliaPreGpuCapabilityCensusV1(candidate)).toEqual({
      ok: false,
      code: "julia-pre-gpu-census-invalid",
    });

    const review = cloneAsset();
    const reviewRows = review.rows as Array<Record<string, unknown>>;
    const reviewRow = reviewRows.find(
      (row) => row.disposition === "not-applicable-review-inconclusive",
    );
    expect(reviewRow).toBeDefined();
    reviewRow!.notApplicableReview = null;
    expect(parseJuliaPreGpuCapabilityCensusV1(review).ok).toBe(false);

    const order = cloneAsset();
    const orderRows = order.rows as unknown[];
    [orderRows[0], orderRows[1]] = [orderRows[1], orderRows[0]];
    expect(parseJuliaPreGpuCapabilityCensusV1(order).ok).toBe(false);

    const hash = cloneAsset();
    hash.contentHash = "0".repeat(64);
    expect(parseJuliaPreGpuCapabilityCensusV1(hash).ok).toBe(false);
  });

  it("rejects accessors, sparse arrays, prototype drift, and throwing proxies", () => {
    const accessor = cloneAsset();
    Object.defineProperty(accessor, "stage", {
      enumerable: true,
      get: () => "pre-gpu-closure",
    });
    expect(parseJuliaPreGpuCapabilityCensusV1(accessor).ok).toBe(false);

    const sparse = cloneAsset();
    const sparseRows = sparse.rows as unknown[];
    delete sparseRows[0];
    expect(parseJuliaPreGpuCapabilityCensusV1(sparse).ok).toBe(false);

    const arrayProperty = cloneAsset();
    const propertyRows = arrayProperty.rows as unknown[] & { extra?: boolean };
    propertyRows.extra = true;
    expect(parseJuliaPreGpuCapabilityCensusV1(arrayProperty).ok).toBe(false);

    const prototype = cloneAsset();
    Object.setPrototypeOf(prototype, { inherited: true });
    expect(parseJuliaPreGpuCapabilityCensusV1(prototype).ok).toBe(false);

    const throwing = new Proxy(cloneAsset(), {
      ownKeys: () => {
        throw new Error("untrusted-proxy");
      },
    });
    expect(parseJuliaPreGpuCapabilityCensusV1(throwing)).toEqual({
      ok: false,
      code: "julia-pre-gpu-census-invalid",
    });
  });

  it("rejects recomputed-hash cross-field, binding-set, and count tampering", () => {
    const crossLane = cloneAsset();
    const crossRows = crossLane.rows as Array<Record<string, unknown>>;
    const existingRow = crossRows.find(
      (row) =>
        row.lane === "existing-system-c" && row.disposition === "tier2-pending",
    );
    expect(existingRow).toBeDefined();
    const crossContract: JuliaBindingContractV1 = {
      binding: {
        kind: "source-split",
        sourceRevision: existingRow!.evaluatedSourceRevision as string,
      },
      modeClass: "classic-julia",
      supportLane: "source-split",
      z0Role: "pixel-seed",
      invariant: "parameter-plane-bit-identical",
    };
    existingRow!.contract = crossContract;
    existingRow!.bindingRevision = bindingRevision(
      existingRow!.formulaId as string,
      existingRow!.evaluatedSourceRevision as string,
      crossContract,
    );
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(crossLane)).ok,
    ).toBe(false);

    const bindingRevisionDrift = cloneAsset();
    const bindingRows = bindingRevisionDrift.rows as Array<Record<string, unknown>>;
    bindingRows.find((row) => row.bindingRevision !== null)!.bindingRevision =
      "0".repeat(64);
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(bindingRevisionDrift)).ok,
    ).toBe(false);

    const missingBinding = cloneAsset();
    delete (missingBinding.sourceBindings as Record<string, unknown>)["package.json"];
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(missingBinding)).ok,
    ).toBe(false);

    const blockedCounts = cloneAsset();
    (blockedCounts.blockedCounts as Record<string, unknown>).existingSystemCTier1 = 0;
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(blockedCounts)).ok,
    ).toBe(false);

    const reviewCount = cloneAsset();
    (reviewCount.notApplicableReviewPolicy as Record<string, unknown>).reviewedRowCount =
      0;
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(reviewCount)).ok,
    ).toBe(false);

    const evidenceHash = cloneAsset();
    const evidenceRows = evidenceHash.rows as Array<Record<string, unknown>>;
    evidenceRows[0]!.evidenceContentHash = "0".repeat(64);
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(evidenceHash)).ok,
    ).toBe(false);

    const coordinatedEvidenceSwap = cloneAsset();
    (coordinatedEvidenceSwap.evidenceContentHashes as Record<string, unknown>)[
      "existingSystemC"
    ] = parameter.contentHash;
    for (const row of coordinatedEvidenceSwap.rows as Array<
      Record<string, unknown>
    >) {
      if (row.lane === "existing-system-c") {
        row.evidenceContentHash = parameter.contentHash;
      }
    }
    coordinatedEvidenceSwap.authorityContentHash = authorityContentHash(
      coordinatedEvidenceSwap,
    );
    expect(
      parseJuliaPreGpuCapabilityCensusV1(
        rehashAsset(coordinatedEvidenceSwap),
      ).ok,
    ).toBe(false);

    const coordinatedAuthoritySwap = cloneAsset();
    coordinatedAuthoritySwap.runtimeIndexCanonicalSha256 = "0".repeat(64);
    coordinatedAuthoritySwap.liveCensusContentHash = "1".repeat(64);
    coordinatedAuthoritySwap.publicationDecisionsContentHash = "2".repeat(64);
    const coordinatedSourceBindings =
      coordinatedAuthoritySwap.sourceBindings as Record<string, unknown>;
    for (const path of Object.keys(coordinatedSourceBindings)) {
      coordinatedSourceBindings[path] = "3".repeat(64);
    }
    coordinatedAuthoritySwap.authorityContentHash = authorityContentHash(
      coordinatedAuthoritySwap,
    );
    expect(
      parseJuliaPreGpuCapabilityCensusV1(
        rehashAsset(coordinatedAuthoritySwap),
      ).ok,
    ).toBe(false);

    const enhancement = cloneAsset();
    (enhancement.enhancementValidation as Record<string, unknown>).validatedCandidateCount =
      0;
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(enhancement)).ok,
    ).toBe(false);

    const falsePromotion = cloneAsset();
    const promotedRows = falsePromotion.rows as Array<Record<string, unknown>>;
    const promotedRow = promotedRows.find(
      (row) =>
        row.disposition === "parameter-binding-tier0-source-blocked" &&
        row.contract !== null,
    );
    expect(promotedRow).toBeDefined();
    promotedRow!.status = "unknown";
    promotedRow!.disposition = "tier2-pending";
    promotedRow!.nextRequiredEvidence = "tier2-webgl-parity";
    const promotedMode = promotedRow!.modeClass as
      | "classic-julia"
      | "generalized-two-plane";
    const statusCounts = falsePromotion.statusCounts as Record<string, number>;
    statusCounts.unknown += 1;
    statusCounts.blocked -= 1;
    const readyCounts = falsePromotion.preGpuReadyCounts as Record<string, number>;
    readyCounts.total += 1;
    readyCounts.parameterBinding += 1;
    readyCounts[
      promotedMode === "classic-julia" ? "classic" : "generalized"
    ] += 1;
    const blockedBreakdown = falsePromotion.blockedCounts as Record<string, number>;
    blockedBreakdown.total -= 1;
    blockedBreakdown.parameterBindingTier0 -= 1;
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(falsePromotion)).ok,
    ).toBe(false);

    const attemptedStageDrift = cloneAsset();
    const attemptedRows = attemptedStageDrift.rows as Array<Record<string, unknown>>;
    const attemptedRow = attemptedRows.find(
      (row) => row.disposition === "tier2-pending",
    );
    expect(attemptedRow).toBeDefined();
    attemptedRow!.attemptedStages = [
      ...((attemptedRow!.attemptedStages as string[]).slice().reverse()),
    ];
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(attemptedStageDrift)).ok,
    ).toBe(false);

    const pairedSwap = cloneAsset();
    const pairedRows = pairedSwap.rows as Array<Record<string, unknown>>;
    const parameterRow = pairedRows.find(
      (row) =>
        row.disposition === "parameter-binding-tier0-source-blocked" &&
        row.contract !== null,
    );
    const existingRowForSwap = pairedRows.find(
      (row) =>
        row.disposition === "tier2-pending" &&
        row.lane === "existing-system-c",
    );
    expect(parameterRow).toBeDefined();
    expect(existingRowForSwap).toBeDefined();
    const parameterContract = structuredClone(
      parameterRow!.contract,
    ) as JuliaBindingContractV1;
    const existingContract = structuredClone(
      existingRowForSwap!.contract,
    ) as JuliaBindingContractV1;

    parameterRow!.status = "unknown";
    parameterRow!.disposition = "tier2-pending";
    parameterRow!.lane = "existing-system-c";
    parameterRow!.modeClass = existingContract.modeClass;
    parameterRow!.contract = existingContract;
    parameterRow!.bindingRevision = bindingRevision(
      parameterRow!.formulaId as string,
      parameterRow!.evaluatedSourceRevision as string,
      existingContract,
    );
    parameterRow!.evidenceContentHash = existing.contentHash;
    parameterRow!.attemptedStages = [
      "lane0-static-role-classification",
      "tier0-source-rights-safety",
      "tier1-standard32-cpu",
    ];
    parameterRow!.nextRequiredEvidence = "tier2-webgl-parity";

    existingRowForSwap!.status = "blocked";
    existingRowForSwap!.disposition = "parameter-binding-tier0-source-blocked";
    existingRowForSwap!.lane = "parameter-binding";
    existingRowForSwap!.modeClass = parameterContract.modeClass;
    existingRowForSwap!.contract = parameterContract;
    existingRowForSwap!.bindingRevision = bindingRevision(
      existingRowForSwap!.formulaId as string,
      existingRowForSwap!.evaluatedSourceRevision as string,
      parameterContract,
    );
    existingRowForSwap!.evidenceContentHash = parameter.contentHash;
    existingRowForSwap!.attemptedStages = [
      "lane0-static-role-classification",
      "parameter-slot-scan",
      "tier0-source-rights-safety",
      "tier1-standard32-cpu",
    ];
    existingRowForSwap!.nextRequiredEvidence =
      "canonical-source-revision-and-replay";

    pairedSwap.rowMapContentHash = rowMapContentHash(pairedRows);
    expect(pairedSwap.rowMapContentHash).not.toBe(
      EXPECTED_ROW_MAP_CONTENT_HASH,
    );
    expect(
      parseJuliaPreGpuCapabilityCensusV1(rehashAsset(pairedSwap)).ok,
    ).toBe(false);
  });
});
