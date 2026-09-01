import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { JuliaBindingContractV1 } from "../src/engine/formulas/v1/julia-binding";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";
import {
  parsePublishedFormulaRuntimeIndexV1,
  PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
  PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
} from "../src/engine/formulas/v1/published-runtime";

const ROOT = process.cwd();
const RESOURCE_ROOT = join(ROOT, "resources/formula-library/v1");
const LIVE_CENSUS_PATH = join(
  RESOURCE_ROOT,
  "julia-capability-census.v1.json",
);
const EXISTING_PATH = join(
  RESOURCE_ROOT,
  "julia-existing-system-c-evidence.v1.json",
);
const PARAMETER_PATH = join(
  RESOURCE_ROOT,
  "julia-parameter-binding-evidence.v1.json",
);
const SOURCE_SPLIT_PATH = join(
  RESOURCE_ROOT,
  "julia-source-split-evidence.v1.json",
);
const CANDIDATE_ROOT_RELATIVE =
  "resources/formula-library/v1/julia-source-split-candidates/definitions" as const;
const CANDIDATE_ROOT = join(ROOT, CANDIDATE_ROOT_RELATIVE);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const OUTPUT_PATH = join(
  RESOURCE_ROOT,
  "julia-pre-gpu-capability-census.v1.json",
);
const SCHEMA = "fractalpark-julia-pre-gpu-capability-census/v1" as const;
const CANONICAL_NODE_BUDGET = 131_072;
const EXPECTED_FORMULAS = 534;
const EXPECTED_EXISTING = 76;
const EXPECTED_PARAMETER = 175;
const EXPECTED_SOURCE_SPLIT_PROPOSALS = 117;
const EXPECTED_SOURCE_SPLIT_CANDIDATES = 111;
const EXPECTED_SOURCE_SPLIT_BLOCKED = 6;
const EXPECTED_MUTABLE_ALIAS = 17;
const EXPECTED_INCONCLUSIVE = 149;
const EXPECTED_PRE_GPU_READY = 185;
const EXPECTED_UNKNOWN = 334;
const EXPECTED_BLOCKED = 200;
const EXPECTED_ROW_MAP_CONTENT_HASH =
  "4422b87a471ed33134c8af448fe393d39fd5c05466a0bea76e22a09ce6d3f480";
const EXPECTED_EXISTING_EVIDENCE_CONTENT_HASH =
  "7b0aa9566152eba57af1fb93ff2cf3f1df188a3f534e8e08608cf41fcf1e8b91";
const EXPECTED_PARAMETER_EVIDENCE_CONTENT_HASH =
  "6c03562d69731ed3e4484799057d32eb3dc1049478bfb2e31a1d5e9322027f49";
const EXPECTED_SOURCE_SPLIT_EVIDENCE_CONTENT_HASH =
  "f7901187c6af82ca131a1acfeb8a05c49714a90cafd57e0c29d1c564e5a48cc3";
const EXPECTED_AUTHORITY_CONTENT_HASH =
  "fa531a2d830999c9585d4713ef0860d8f2e74c458b6daede69a4d9e7b80d3d19";
const SOURCE_BINDING_PATHS = Object.freeze([
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
] as const);

type LiveCensus = Readonly<{
  schema: "fractalpark-julia-capability-census/v1";
  contentHash: string;
  rows: readonly Readonly<{ formulaId: string; status: string }>[];
}>;

type ExistingRow = Readonly<{
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  bindingRevision: string;
  contract: JuliaBindingContractV1;
  tier1: Readonly<{ status: "tier1-candidate" | "blocked" }>;
}>;
type ExistingEvidence = Readonly<{
  schema: "fractalpark-julia-existing-system-c-evidence/v1";
  contentHash: string;
  candidateCount: number;
  tier1PassCount: number;
  tier1BlockedCount: number;
  rows: readonly ExistingRow[];
}>;

type ParameterAttempt = Readonly<{
  slotName: string;
  status: "static-rejected" | "tier1-candidate" | "blocked";
  bindingRevision?: string;
  contract?: JuliaBindingContractV1;
}>;
type ParameterRow = Readonly<{
  formulaId: string;
  sourceRevision: string;
  semanticHash: string;
  tier0: Readonly<{
    status: "passed" | "blocked" | "not-required";
    failureCode?: string;
  }>;
  attempts: readonly ParameterAttempt[];
  slotResolution:
    | Readonly<{
        status: "single-passing-slot";
        selectedSlotName: string;
        selectedBindingRevision: string;
        modeClass: "classic-julia" | "generalized-two-plane";
      }>
    | Readonly<{
        status: "multiple-passing-slots";
        passingSlotNames: readonly string[];
      }>
    | Readonly<{
        status: "no-passing-slot";
        reasonCode: string;
      }>;
}>;
type ParameterEvidence = Readonly<{
  schema: "fractalpark-julia-parameter-binding-evidence/v1";
  contentHash: string;
  formulaCount: number;
  staticCandidateFormulaCount: number;
  tier0BlockedFormulaCount: number;
  rows: readonly ParameterRow[];
}>;

type SourceSplitRow =
  | Readonly<{
      formulaId: string;
      baselineSourceRevision: string;
      baselineSemanticHash: string;
      status: "prior-lane";
      priorLane: "existing-system-c" | "parameter-binding";
    }>
  | Readonly<{
      formulaId: string;
      baselineSourceRevision: string;
      baselineSemanticHash: string;
      status: "not-selected";
      reasonCode:
        | "julia-source-split-no-mechanical-role"
        | "julia-source-split-mutable-pixel-alias";
    }>
  | Readonly<{
      formulaId: string;
      baselineSourceRevision: string;
      baselineSemanticHash: string;
      status: "candidate-only" | "blocked";
      identity: Readonly<{
        candidateSourceRevision: string;
        candidateSemanticHash: string;
      }>;
      isolation: Readonly<{
        candidateDefinitionPath?: string;
      }>;
      tier1: Readonly<{
        bindingRevision: string;
        contract: JuliaBindingContractV1;
        candidatePass: boolean;
      }>;
    }>;
type SourceSplitEvidence = Readonly<{
  schema: "fractalpark-julia-source-split-evidence/v1";
  contentHash: string;
  formulaCount: number;
  rewriteProposalCount: number;
  candidateOnlyFormulaCount: number;
  blockedFormulaCount: number;
  mutablePixelAliasFormulaCount: number;
  noMechanicalRoleFormulaCount: number;
  candidateDefinitionCount: number;
  rows: readonly SourceSplitRow[];
}>;

type ContractWithoutCandidate = Omit<JuliaBindingContractV1, "candidateKind">;

type ClosureRow = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  evaluatedSourceRevision: string;
  evaluatedSemanticHash: string;
  status: "unknown" | "blocked" | "not-applicable";
  disposition:
    | "tier2-pending"
    | "existing-system-c-tier1-blocked"
    | "parameter-binding-tier0-source-blocked"
    | "source-split-tier1-blocked"
    | "source-split-mutable-alias-blocked"
    | "not-applicable-review-inconclusive";
  lane:
    | "existing-system-c"
    | "parameter-binding"
    | "source-split"
    | "none";
  modeClass:
    | "classic-julia"
    | "generalized-two-plane"
    | "undetermined";
  contract: ContractWithoutCandidate | null;
  bindingRevision: string | null;
  evidenceContentHash: string;
  attemptedStages: readonly string[];
  nextRequiredEvidence:
    | "tier2-webgl-parity"
    | "tier1-remediation-or-revision"
    | "canonical-source-revision-and-replay"
    | "source-split-remediation-or-revision"
    | "independent-review-or-identity-analysis";
  notApplicableReview:
    | null
    | Readonly<{
        technicalAuthorDecision: "inconclusive";
        independentReviewerDecision: "required-for-terminal-not-applicable";
        reasonCode: "fixed-literal-or-identity-change-not-exhausted";
      }>;
}>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function sourceBindings(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      SOURCE_BINDING_PATHS.map((relativePath) => {
        const path = join(ROOT, relativePath);
        invariant(existsSync(path), `julia-pre-gpu-source-missing:${relativePath}`);
        return [relativePath, sha256HexSyncV1(readFileSync(path, "utf8"))];
      }),
    ),
  );
}

function withoutCandidateKind(
  contract: JuliaBindingContractV1,
): ContractWithoutCandidate {
  return {
    binding: contract.binding,
    modeClass: contract.modeClass,
    supportLane: contract.supportLane,
    z0Role: contract.z0Role,
    invariant: contract.invariant,
  };
}

function rowMapEntry(row: ClosureRow) {
  return {
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
  };
}

function existingRow(
  row: ExistingRow,
  evidenceContentHash: string,
): ClosureRow {
  const passed = row.tier1.status === "tier1-candidate";
  invariant(
    row.contract.modeClass === "classic-julia",
    `julia-pre-gpu-existing-mode-invalid:${row.formulaId}`,
  );
  return {
    formulaId: row.formulaId,
    baselineSourceRevision: row.sourceRevision,
    evaluatedSourceRevision: row.sourceRevision,
    evaluatedSemanticHash: row.semanticHash,
    status: passed ? "unknown" : "blocked",
    disposition: passed
      ? "tier2-pending"
      : "existing-system-c-tier1-blocked",
    lane: "existing-system-c",
    modeClass: row.contract.modeClass,
    contract: withoutCandidateKind(row.contract),
    bindingRevision: row.bindingRevision,
    evidenceContentHash,
    attemptedStages: [
      "lane0-static-role-classification",
      "tier0-source-rights-safety",
      "tier1-standard32-cpu",
    ],
    nextRequiredEvidence: passed
      ? "tier2-webgl-parity"
      : "tier1-remediation-or-revision",
    notApplicableReview: null,
  };
}

function parameterRow(
  row: ParameterRow,
  evidenceContentHash: string,
): ClosureRow {
  invariant(
    row.tier0.status === "blocked" && row.tier0.failureCode === "source-not-canonical",
    `julia-pre-gpu-parameter-tier0-not-blocked:${row.formulaId}`,
  );
  let contract: ContractWithoutCandidate | null = null;
  let bindingRevision: string | null = null;
  let modeClass: ClosureRow["modeClass"] = "undetermined";
  if (row.slotResolution.status === "single-passing-slot") {
    const resolution = row.slotResolution;
    const selected = row.attempts.find(
      (attempt) =>
        attempt.slotName === resolution.selectedSlotName &&
        attempt.status === "tier1-candidate",
    );
    invariant(
      selected?.contract &&
        selected.bindingRevision === resolution.selectedBindingRevision,
      `julia-pre-gpu-parameter-selection-invalid:${row.formulaId}`,
    );
    contract = withoutCandidateKind(selected.contract);
    bindingRevision = selected.bindingRevision ?? null;
    modeClass = resolution.modeClass;
  }
  return {
    formulaId: row.formulaId,
    baselineSourceRevision: row.sourceRevision,
    evaluatedSourceRevision: row.sourceRevision,
    evaluatedSemanticHash: row.semanticHash,
    status: "blocked",
    disposition: "parameter-binding-tier0-source-blocked",
    lane: "parameter-binding",
    modeClass,
    contract,
    bindingRevision,
    evidenceContentHash,
    attemptedStages: [
      "lane0-static-role-classification",
      "parameter-slot-scan",
      "tier0-source-rights-safety",
      "tier1-standard32-cpu",
    ],
    nextRequiredEvidence: "canonical-source-revision-and-replay",
    notApplicableReview: null,
  };
}

function sourceSplitRow(
  row: Exclude<SourceSplitRow, { status: "prior-lane" }>,
  evidenceContentHash: string,
): ClosureRow {
  if (row.status === "candidate-only" || row.status === "blocked") {
    const passed = row.status === "candidate-only";
    invariant(
      row.tier1.candidatePass === passed,
      `julia-pre-gpu-source-split-pass-drift:${row.formulaId}`,
    );
    invariant(
      row.tier1.contract.modeClass === "classic-julia",
      `julia-pre-gpu-source-split-mode-invalid:${row.formulaId}`,
    );
    return {
      formulaId: row.formulaId,
      baselineSourceRevision: row.baselineSourceRevision,
      evaluatedSourceRevision: row.identity.candidateSourceRevision,
      evaluatedSemanticHash: row.identity.candidateSemanticHash,
      status: passed ? "unknown" : "blocked",
      disposition: passed ? "tier2-pending" : "source-split-tier1-blocked",
      lane: "source-split",
      modeClass: row.tier1.contract.modeClass,
      contract: withoutCandidateKind(row.tier1.contract),
      bindingRevision: row.tier1.bindingRevision,
      evidenceContentHash,
      attemptedStages: [
        "lane0-static-role-classification",
        "source-split-transform",
        "tier0-source-rights-safety",
        "tier1-standard32-cpu",
        "parameter-plane-identity",
      ],
      nextRequiredEvidence: passed
        ? "tier2-webgl-parity"
        : "source-split-remediation-or-revision",
      notApplicableReview: null,
    };
  }
  invariant(
    "reasonCode" in row,
    `julia-pre-gpu-source-split-row-invalid:${row.formulaId}`,
  );
  if (row.reasonCode === "julia-source-split-mutable-pixel-alias") {
    return {
      formulaId: row.formulaId,
      baselineSourceRevision: row.baselineSourceRevision,
      evaluatedSourceRevision: row.baselineSourceRevision,
      evaluatedSemanticHash: row.baselineSemanticHash,
      status: "blocked",
      disposition: "source-split-mutable-alias-blocked",
      lane: "none",
      modeClass: "undetermined",
      contract: null,
      bindingRevision: null,
      evidenceContentHash,
      attemptedStages: [
        "lane0-static-role-classification",
        "parameter-slot-scan",
        "source-split-transform",
      ],
      nextRequiredEvidence: "source-split-remediation-or-revision",
      notApplicableReview: null,
    };
  }
  return {
    formulaId: row.formulaId,
    baselineSourceRevision: row.baselineSourceRevision,
    evaluatedSourceRevision: row.baselineSourceRevision,
    evaluatedSemanticHash: row.baselineSemanticHash,
    status: "unknown",
    disposition: "not-applicable-review-inconclusive",
    lane: "none",
    modeClass: "undetermined",
    contract: null,
    bindingRevision: null,
    evidenceContentHash,
    attemptedStages: [
      "lane0-static-role-classification",
      "parameter-slot-scan",
      "source-split-transform",
      "not-applicable-technical-review",
    ],
    nextRequiredEvidence: "independent-review-or-identity-analysis",
    notApplicableReview: {
      technicalAuthorDecision: "inconclusive",
      independentReviewerDecision: "required-for-terminal-not-applicable",
      reasonCode: "fixed-literal-or-identity-change-not-exhausted",
    },
  };
}

function validateCandidateDefinitions(rows: readonly ClosureRow[]): void {
  const expected = rows
    .filter(
      (row) => row.disposition === "tier2-pending" && row.lane === "source-split",
    )
    .map((row) => `${row.evaluatedSourceRevision}.frm`)
    .sort();
  const actual = readdirSync(CANDIDATE_ROOT)
    .filter((name) => name.endsWith(".frm"))
    .sort();
  invariant(
    canonicalJsonV1(actual) === canonicalJsonV1(expected),
    "julia-pre-gpu-candidate-definition-set-drift",
  );
  for (const name of actual) {
    const source = readFileSync(join(CANDIDATE_ROOT, name), "utf8");
    invariant(
      `${sha256HexSyncV1(source)}.frm` === name,
      `julia-pre-gpu-candidate-definition-hash-drift:${name}`,
    );
  }
}

function buildArtifact() {
  const live = readJson<LiveCensus>(LIVE_CENSUS_PATH);
  const existing = readJson<ExistingEvidence>(EXISTING_PATH);
  const parameter = readJson<ParameterEvidence>(PARAMETER_PATH);
  const sourceSplit = readJson<SourceSplitEvidence>(SOURCE_SPLIT_PATH);
  const runtime = parsePublishedFormulaRuntimeIndexV1(
    readJson<unknown>(RUNTIME_INDEX_PATH),
  );
  invariant(runtime.ok, "julia-pre-gpu-runtime-index-invalid");
  invariant(
    live.schema === "fractalpark-julia-capability-census/v1" &&
      live.rows.length === EXPECTED_FORMULAS &&
      live.rows.every((row) => row.status === "unknown"),
    "julia-pre-gpu-live-census-not-closed-unknown",
  );
  invariant(
    existing.schema === "fractalpark-julia-existing-system-c-evidence/v1" &&
      existing.contentHash === EXPECTED_EXISTING_EVIDENCE_CONTENT_HASH &&
      existing.candidateCount === EXPECTED_EXISTING &&
      existing.tier1PassCount === 74 &&
      existing.tier1BlockedCount === 2 &&
      existing.rows.length === EXPECTED_EXISTING,
    "julia-pre-gpu-existing-evidence-invalid",
  );
  invariant(
    parameter.schema === "fractalpark-julia-parameter-binding-evidence/v1" &&
      parameter.contentHash === EXPECTED_PARAMETER_EVIDENCE_CONTENT_HASH &&
      parameter.formulaCount === EXPECTED_FORMULAS &&
      parameter.staticCandidateFormulaCount === EXPECTED_PARAMETER &&
      parameter.tier0BlockedFormulaCount === EXPECTED_PARAMETER &&
      parameter.rows.length === EXPECTED_FORMULAS,
    "julia-pre-gpu-parameter-evidence-invalid",
  );
  invariant(
    sourceSplit.schema === "fractalpark-julia-source-split-evidence/v1" &&
      sourceSplit.contentHash === EXPECTED_SOURCE_SPLIT_EVIDENCE_CONTENT_HASH &&
      sourceSplit.formulaCount === EXPECTED_FORMULAS &&
      sourceSplit.rewriteProposalCount === EXPECTED_SOURCE_SPLIT_PROPOSALS &&
      sourceSplit.candidateOnlyFormulaCount === EXPECTED_SOURCE_SPLIT_CANDIDATES &&
      sourceSplit.blockedFormulaCount === EXPECTED_SOURCE_SPLIT_BLOCKED &&
      sourceSplit.mutablePixelAliasFormulaCount === EXPECTED_MUTABLE_ALIAS &&
      sourceSplit.noMechanicalRoleFormulaCount === EXPECTED_INCONCLUSIVE &&
      sourceSplit.candidateDefinitionCount === EXPECTED_SOURCE_SPLIT_CANDIDATES &&
      sourceSplit.rows.length === EXPECTED_FORMULAS,
    "julia-pre-gpu-source-split-evidence-invalid",
  );

  const existingById = new Map(existing.rows.map((row) => [row.formulaId, row]));
  const parameterById = new Map(parameter.rows.map((row) => [row.formulaId, row]));
  const sourceSplitById = new Map(
    sourceSplit.rows.map((row) => [row.formulaId, row]),
  );
  const parameterIds = new Set(
    parameter.rows
      .filter((row) => row.tier0.status !== "not-required")
      .map((row) => row.formulaId),
  );
  invariant(
    existingById.size === EXPECTED_EXISTING &&
      parameterIds.size === EXPECTED_PARAMETER &&
      [...existingById.keys()].every((formulaId) => !parameterIds.has(formulaId)),
    "julia-pre-gpu-prior-lane-partition-invalid",
  );

  const rows: ClosureRow[] = [];
  for (const runtimeRow of runtime.value.rows) {
    const existingEvidence = existingById.get(runtimeRow.formulaId);
    if (existingEvidence) {
      rows.push(existingRow(existingEvidence, existing.contentHash));
      continue;
    }
    if (parameterIds.has(runtimeRow.formulaId)) {
      const parameterEvidence = parameterById.get(runtimeRow.formulaId);
      invariant(
        parameterEvidence,
        `julia-pre-gpu-parameter-row-missing:${runtimeRow.formulaId}`,
      );
      rows.push(parameterRow(parameterEvidence, parameter.contentHash));
      continue;
    }
    const sourceEvidence = sourceSplitById.get(runtimeRow.formulaId);
    invariant(
      sourceEvidence && sourceEvidence.status !== "prior-lane",
      `julia-pre-gpu-source-split-row-missing:${runtimeRow.formulaId}`,
    );
    rows.push(sourceSplitRow(sourceEvidence, sourceSplit.contentHash));
  }
  rows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  invariant(
    rows.length === EXPECTED_FORMULAS &&
      new Set(rows.map((row) => row.formulaId)).size === EXPECTED_FORMULAS,
    "julia-pre-gpu-row-set-invalid",
  );
  validateCandidateDefinitions(rows);

  const unknown = rows.filter((row) => row.status === "unknown").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;
  const notApplicable = rows.filter(
    (row) => row.status === "not-applicable",
  ).length;
  const ready = rows.filter((row) => row.disposition === "tier2-pending");
  const blockedExisting = rows.filter(
    (row) => row.disposition === "existing-system-c-tier1-blocked",
  ).length;
  const blockedParameter = rows.filter(
    (row) => row.disposition === "parameter-binding-tier0-source-blocked",
  ).length;
  const blockedSourceTier1 = rows.filter(
    (row) => row.disposition === "source-split-tier1-blocked",
  ).length;
  const blockedMutableAlias = rows.filter(
    (row) => row.disposition === "source-split-mutable-alias-blocked",
  ).length;
  const inconclusive = rows.filter(
    (row) => row.disposition === "not-applicable-review-inconclusive",
  ).length;
  invariant(
    unknown === EXPECTED_UNKNOWN &&
      blocked === EXPECTED_BLOCKED &&
      notApplicable === 0 &&
      ready.length === EXPECTED_PRE_GPU_READY &&
      inconclusive === EXPECTED_INCONCLUSIVE &&
      blockedExisting === 2 &&
      blockedParameter === EXPECTED_PARAMETER &&
      blockedSourceTier1 === EXPECTED_SOURCE_SPLIT_BLOCKED &&
      blockedMutableAlias === EXPECTED_MUTABLE_ALIAS,
    `julia-pre-gpu-count-drift:${JSON.stringify({ unknown, blocked, notApplicable, ready: ready.length, inconclusive, blockedExisting, blockedParameter, blockedSourceTier1, blockedMutableAlias })}`,
  );
  const rowMapContentHash = sha256HexSyncV1(
    canonicalJsonV1(rows.map(rowMapEntry), CANONICAL_NODE_BUDGET),
  );
  invariant(
    rowMapContentHash === EXPECTED_ROW_MAP_CONTENT_HASH,
    `julia-pre-gpu-row-map-drift:${rowMapContentHash}`,
  );
  const sourceBindingHashes = sourceBindings();
  const authorityContentHash = sha256HexSyncV1(
    canonicalJsonV1({
      runtimeIndexCanonicalSha256: PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
      liveCensusContentHash: live.contentHash,
      publicationDecisionsContentHash:
        PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
      evidenceContentHashes: {
        existingSystemC: existing.contentHash,
        parameterBinding: parameter.contentHash,
        sourceSplit: sourceSplit.contentHash,
      },
      sourceBindings: sourceBindingHashes,
    }),
  );
  invariant(
    authorityContentHash === EXPECTED_AUTHORITY_CONTENT_HASH,
    `julia-pre-gpu-authority-drift:${authorityContentHash}`,
  );

  const content = {
    schema: SCHEMA,
    revision: 1 as const,
    stage: "pre-gpu-closure" as const,
    activationStatus: "inactive-evidence-only" as const,
    runtimeIndexCanonicalSha256:
      PUBLISHED_FORMULA_INDEX_CANONICAL_SHA256_V1,
    liveCensusContentHash: live.contentHash,
    publicationDecisionsContentHash:
      PUBLISHED_FORMULA_DECISION_CONTENT_HASH_V1,
    evidenceContentHashes: {
      existingSystemC: existing.contentHash,
      parameterBinding: parameter.contentHash,
      sourceSplit: sourceSplit.contentHash,
    },
    authorityContentHash,
    rowMapContentHash,
    sourceBindings: sourceBindingHashes,
    rowCount: EXPECTED_FORMULAS,
    statusCounts: {
      supported: 0 as const,
      candidate: 0 as const,
      notApplicable,
      unknown,
      blocked,
    },
    preGpuReadyCounts: {
      total: ready.length,
      classic: ready.filter((row) => row.modeClass === "classic-julia").length,
      generalized: ready.filter(
        (row) => row.modeClass === "generalized-two-plane",
      ).length,
      existingSystemC: ready.filter(
        (row) => row.lane === "existing-system-c",
      ).length,
      parameterBinding: ready.filter(
        (row) => row.lane === "parameter-binding",
      ).length,
      sourceSplit: ready.filter((row) => row.lane === "source-split").length,
    },
    blockedCounts: {
      total: blocked,
      existingSystemCTier1: blockedExisting,
      parameterBindingTier0: blockedParameter,
      sourceSplitTier1: blockedSourceTier1,
      sourceSplitMutableAlias: blockedMutableAlias,
    },
    enhancementValidation: {
      sourceSplitCandidateCount: EXPECTED_SOURCE_SPLIT_CANDIDATES,
      validatedCandidateCount: EXPECTED_SOURCE_SPLIT_CANDIDATES,
      rejectedCandidateCount: 0,
      candidateDefinitionsExactSet: true as const,
    },
    notApplicableReviewPolicy: {
      requiredDecisions: [
        "technical-author",
        "independent-reviewer",
      ] as const,
      reviewedRowCount: inconclusive,
      acceptedCount: notApplicable,
      inconclusiveCount: inconclusive,
    },
    rows,
  };
  return {
    ...content,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
    ),
  };
}

function main(): void {
  const artifact = buildArtifact();
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  const write = process.argv.includes("--write");
  if (write) {
    const temporaryPath = `${OUTPUT_PATH}.tmp`;
    writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o644 });
    renameSync(temporaryPath, OUTPUT_PATH);
    console.log(
      `wrote ${OUTPUT_PATH} (${artifact.rowCount} rows, ${artifact.preGpuReadyCounts.total} pre-GPU ready, ${artifact.statusCounts.candidate} candidate)`,
    );
    return;
  }
  invariant(existsSync(OUTPUT_PATH), "julia-pre-gpu-census-missing");
  invariant(
    readFileSync(OUTPUT_PATH, "utf8") === serialized,
    "julia-pre-gpu-census-drift",
  );
  console.log(
    `verified ${OUTPUT_PATH} (${artifact.rowCount} rows, ${artifact.preGpuReadyCounts.total} pre-GPU ready, ${artifact.statusCounts.candidate} candidate)`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown-error";
  console.error(message);
  process.exitCode = 1;
}
