import censusAsset from "../../../../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";

import {
  parseJuliaBindingContractV1,
  type JuliaBindingContractV1,
} from "./julia-binding";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_NODE_BUDGET = 131_072;
const BINDING_SCHEMA = "fractalpark-julia-binding-revision/v1" as const;
const EXPECTED_ROW_MAP_CONTENT_HASH =
  "4422b87a471ed33134c8af448fe393d39fd5c05466a0bea76e22a09ce6d3f480";
const EXPECTED_EXISTING_EVIDENCE_CONTENT_HASH =
  "1136371d2b1d4283d370e899155843476310707a6deb76f96d997177db559490";
const EXPECTED_PARAMETER_EVIDENCE_CONTENT_HASH =
  "8d8d43cf6ef5a6726afb322e41f897ef0e3feb59f4240a9a7d6a145734e93e4e";
const EXPECTED_SOURCE_SPLIT_EVIDENCE_CONTENT_HASH =
  "865e574bee27d745fcd5f5416d1f3823a6d111058ec23fa3a8dfbd2e71bdfa0d";
const EXPECTED_AUTHORITY_CONTENT_HASH =
  "ed34606d0f7dea0cfe8f65e92a3edaac3d391c15bf094e764487d2caebb179c0";

export const JULIA_PRE_GPU_SOURCE_BINDING_PATHS_V1 = Object.freeze([
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

export const JULIA_PRE_GPU_CAPABILITY_CENSUS_SCHEMA_V1 =
  "fractalpark-julia-pre-gpu-capability-census/v1" as const;
export const JULIA_PRE_GPU_CAPABILITY_CENSUS_REVISION_V1 = 1 as const;
export const JULIA_PRE_GPU_CAPABILITY_CENSUS_ROW_COUNT_V1 = 534 as const;

export type JuliaPreGpuStatusV1 = "unknown" | "blocked" | "not-applicable";
export type JuliaPreGpuLaneV1 =
  | "existing-system-c"
  | "parameter-binding"
  | "source-split"
  | "none";
export type JuliaPreGpuModeClassV1 =
  | "classic-julia"
  | "generalized-two-plane"
  | "undetermined";
export type JuliaPreGpuDispositionV1 =
  | "tier2-pending"
  | "existing-system-c-tier1-blocked"
  | "parameter-binding-tier0-source-blocked"
  | "source-split-tier1-blocked"
  | "source-split-mutable-alias-blocked"
  | "not-applicable-review-inconclusive";
export type JuliaPreGpuNextEvidenceV1 =
  | "tier2-webgl-parity"
  | "tier1-remediation-or-revision"
  | "canonical-source-revision-and-replay"
  | "source-split-remediation-or-revision"
  | "independent-review-or-identity-analysis";

export interface JuliaPreGpuNotApplicableReviewV1 {
  readonly technicalAuthorDecision: "inconclusive";
  readonly independentReviewerDecision: "required-for-terminal-not-applicable";
  readonly reasonCode: "fixed-literal-or-identity-change-not-exhausted";
}

export interface JuliaPreGpuCapabilityRowV1 {
  readonly formulaId: string;
  readonly baselineSourceRevision: string;
  readonly evaluatedSourceRevision: string;
  readonly evaluatedSemanticHash: string;
  readonly status: JuliaPreGpuStatusV1;
  readonly disposition: JuliaPreGpuDispositionV1;
  readonly lane: JuliaPreGpuLaneV1;
  readonly modeClass: JuliaPreGpuModeClassV1;
  readonly contract: JuliaBindingContractV1 | null;
  readonly bindingRevision: string | null;
  readonly evidenceContentHash: string;
  readonly attemptedStages: readonly string[];
  readonly nextRequiredEvidence: JuliaPreGpuNextEvidenceV1;
  readonly notApplicableReview: JuliaPreGpuNotApplicableReviewV1 | null;
}

export interface JuliaPreGpuCapabilityCensusV1 {
  readonly schema: typeof JULIA_PRE_GPU_CAPABILITY_CENSUS_SCHEMA_V1;
  readonly revision: typeof JULIA_PRE_GPU_CAPABILITY_CENSUS_REVISION_V1;
  readonly stage: "pre-gpu-closure";
  readonly activationStatus: "inactive-evidence-only";
  readonly runtimeIndexCanonicalSha256: string;
  readonly liveCensusContentHash: string;
  readonly publicationDecisionsContentHash: string;
  readonly evidenceContentHashes: Readonly<{
    existingSystemC: string;
    parameterBinding: string;
    sourceSplit: string;
  }>;
  readonly authorityContentHash: string;
  readonly rowMapContentHash: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: typeof JULIA_PRE_GPU_CAPABILITY_CENSUS_ROW_COUNT_V1;
  readonly statusCounts: Readonly<{
    supported: 0;
    candidate: 0;
    notApplicable: number;
    unknown: number;
    blocked: number;
  }>;
  readonly preGpuReadyCounts: Readonly<{
    total: number;
    classic: number;
    generalized: number;
    existingSystemC: number;
    parameterBinding: number;
    sourceSplit: number;
  }>;
  readonly blockedCounts: Readonly<{
    total: number;
    existingSystemCTier1: number;
    parameterBindingTier0: number;
    sourceSplitTier1: number;
    sourceSplitMutableAlias: number;
  }>;
  readonly enhancementValidation: Readonly<{
    sourceSplitCandidateCount: number;
    validatedCandidateCount: number;
    rejectedCandidateCount: number;
    candidateDefinitionsExactSet: true;
  }>;
  readonly notApplicableReviewPolicy: Readonly<{
    requiredDecisions: readonly ["technical-author", "independent-reviewer"];
    reviewedRowCount: number;
    acceptedCount: number;
    inconclusiveCount: number;
  }>;
  readonly rows: readonly JuliaPreGpuCapabilityRowV1[];
  readonly contentHash: string;
}

export type JuliaPreGpuCapabilityCensusParseResultV1 =
  | { readonly ok: true; readonly value: JuliaPreGpuCapabilityCensusV1 }
  | { readonly ok: false; readonly code: "julia-pre-gpu-census-invalid" };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key) => typeof key === "string") &&
    [...(keys as string[])].sort().join("\u0000") ===
      [...expected].sort().join("\u0000")
  );
}

function immutableJson(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableJson));
  if (record(value)) {
    const clone: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) clone[key] = immutableJson(child);
    return Object.freeze(clone);
  }
  return value;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function parseCountRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, number> {
  return (
    record(value) &&
    exactKeys(value, keys) &&
    keys.every((key) => nonNegativeInteger(value[key]))
  );
}

function parseReview(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "technicalAuthorDecision",
      "independentReviewerDecision",
      "reasonCode",
    ]) &&
    value.technicalAuthorDecision === "inconclusive" &&
    value.independentReviewerDecision ===
      "required-for-terminal-not-applicable" &&
    value.reasonCode === "fixed-literal-or-identity-change-not-exhausted"
  );
}

const DISPOSITIONS = new Set<JuliaPreGpuDispositionV1>([
  "tier2-pending",
  "existing-system-c-tier1-blocked",
  "parameter-binding-tier0-source-blocked",
  "source-split-tier1-blocked",
  "source-split-mutable-alias-blocked",
  "not-applicable-review-inconclusive",
]);
const NEXT_EVIDENCE = new Set<JuliaPreGpuNextEvidenceV1>([
  "tier2-webgl-parity",
  "tier1-remediation-or-revision",
  "canonical-source-revision-and-replay",
  "source-split-remediation-or-revision",
  "independent-review-or-identity-analysis",
]);
const EXISTING_STAGES = Object.freeze([
  "lane0-static-role-classification",
  "tier0-source-rights-safety",
  "tier1-standard32-cpu",
] as const);
const PARAMETER_STAGES = Object.freeze([
  "lane0-static-role-classification",
  "parameter-slot-scan",
  "tier0-source-rights-safety",
  "tier1-standard32-cpu",
] as const);
const SOURCE_SPLIT_STAGES = Object.freeze([
  "lane0-static-role-classification",
  "source-split-transform",
  "tier0-source-rights-safety",
  "tier1-standard32-cpu",
  "parameter-plane-identity",
] as const);
const MUTABLE_ALIAS_STAGES = Object.freeze([
  "lane0-static-role-classification",
  "parameter-slot-scan",
  "source-split-transform",
] as const);
const INCONCLUSIVE_STAGES = Object.freeze([
  "lane0-static-role-classification",
  "parameter-slot-scan",
  "source-split-transform",
  "not-applicable-technical-review",
] as const);

function exactStringArray(
  value: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
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

function rowMapEntry(row: JuliaPreGpuCapabilityRowV1) {
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

function parseRow(value: unknown): value is JuliaPreGpuCapabilityRowV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "formulaId",
      "baselineSourceRevision",
      "evaluatedSourceRevision",
      "evaluatedSemanticHash",
      "status",
      "disposition",
      "lane",
      "modeClass",
      "contract",
      "bindingRevision",
      "evidenceContentHash",
      "attemptedStages",
      "nextRequiredEvidence",
      "notApplicableReview",
    ]) ||
    typeof value.formulaId !== "string" ||
    !UUID_V5.test(value.formulaId) ||
    typeof value.baselineSourceRevision !== "string" ||
    !SHA256.test(value.baselineSourceRevision) ||
    typeof value.evaluatedSourceRevision !== "string" ||
    !SHA256.test(value.evaluatedSourceRevision) ||
    typeof value.evaluatedSemanticHash !== "string" ||
    !SHA256.test(value.evaluatedSemanticHash) ||
    (value.status !== "unknown" &&
      value.status !== "blocked" &&
      value.status !== "not-applicable") ||
    typeof value.disposition !== "string" ||
    !DISPOSITIONS.has(value.disposition as JuliaPreGpuDispositionV1) ||
    typeof value.lane !== "string" ||
    !["existing-system-c", "parameter-binding", "source-split", "none"].includes(
      value.lane,
    ) ||
    typeof value.modeClass !== "string" ||
    !["classic-julia", "generalized-two-plane", "undetermined"].includes(
      value.modeClass,
    ) ||
    (value.bindingRevision !== null &&
      (typeof value.bindingRevision !== "string" ||
        !SHA256.test(value.bindingRevision))) ||
    typeof value.evidenceContentHash !== "string" ||
    !SHA256.test(value.evidenceContentHash) ||
    !Array.isArray(value.attemptedStages) ||
    value.attemptedStages.length === 0 ||
    value.attemptedStages.some(
      (stage) => typeof stage !== "string" || stage.length === 0,
    ) ||
    new Set(value.attemptedStages).size !== value.attemptedStages.length ||
    typeof value.nextRequiredEvidence !== "string" ||
    !NEXT_EVIDENCE.has(value.nextRequiredEvidence as JuliaPreGpuNextEvidenceV1)
  )
    return false;

  const parsedContract =
    value.contract === null ? null : parseJuliaBindingContractV1(value.contract);
  if (parsedContract !== null && !parsedContract.ok) return false;
  if (
    value.contract !== null &&
    record(value.contract) &&
    Object.hasOwn(value.contract, "candidateKind")
  )
    return false;

  const contract = parsedContract?.ok ? parsedContract.value : null;
  if (contract === null) {
    if (
      value.contract !== null ||
      value.bindingRevision !== null ||
      value.modeClass !== "undetermined" ||
      value.lane === "existing-system-c" ||
      value.lane === "source-split"
    )
      return false;
  } else if (
    value.bindingRevision === null ||
    value.lane === "none" ||
    contract.supportLane !== value.lane ||
    contract.modeClass !== value.modeClass ||
    value.bindingRevision !==
      bindingRevision(value.formulaId, value.evaluatedSourceRevision, contract) ||
    (contract.binding.kind === "source-split" &&
      contract.binding.sourceRevision !== value.evaluatedSourceRevision)
  ) {
    return false;
  }
  if (
    (value.lane === "source-split" &&
      value.evaluatedSourceRevision === value.baselineSourceRevision) ||
    (value.lane !== "source-split" &&
      value.evaluatedSourceRevision !== value.baselineSourceRevision)
  )
    return false;

  switch (value.disposition) {
    case "tier2-pending":
      return (
        value.status === "unknown" &&
        contract !== null &&
        (value.lane === "existing-system-c" || value.lane === "source-split") &&
        exactStringArray(
          value.attemptedStages,
          value.lane === "existing-system-c"
            ? EXISTING_STAGES
            : SOURCE_SPLIT_STAGES,
        ) &&
        value.nextRequiredEvidence === "tier2-webgl-parity" &&
        value.notApplicableReview === null
      );
    case "existing-system-c-tier1-blocked":
      return (
        value.status === "blocked" &&
        value.lane === "existing-system-c" &&
        contract !== null &&
        exactStringArray(value.attemptedStages, EXISTING_STAGES) &&
        value.nextRequiredEvidence === "tier1-remediation-or-revision" &&
        value.notApplicableReview === null
      );
    case "parameter-binding-tier0-source-blocked":
      return (
        value.status === "blocked" &&
        value.lane === "parameter-binding" &&
        exactStringArray(value.attemptedStages, PARAMETER_STAGES) &&
        value.nextRequiredEvidence ===
          "canonical-source-revision-and-replay" &&
        value.notApplicableReview === null
      );
    case "source-split-tier1-blocked":
      return (
        value.status === "blocked" &&
        value.lane === "source-split" &&
        contract !== null &&
        exactStringArray(value.attemptedStages, SOURCE_SPLIT_STAGES) &&
        value.nextRequiredEvidence ===
          "source-split-remediation-or-revision" &&
        value.notApplicableReview === null
      );
    case "source-split-mutable-alias-blocked":
      return (
        value.status === "blocked" &&
        value.lane === "none" &&
        contract === null &&
        exactStringArray(value.attemptedStages, MUTABLE_ALIAS_STAGES) &&
        value.nextRequiredEvidence ===
          "source-split-remediation-or-revision" &&
        value.notApplicableReview === null
      );
    case "not-applicable-review-inconclusive":
      return (
        value.status === "unknown" &&
        value.lane === "none" &&
        contract === null &&
        exactStringArray(value.attemptedStages, INCONCLUSIVE_STAGES) &&
        value.nextRequiredEvidence ===
          "independent-review-or-identity-analysis" &&
        parseReview(value.notApplicableReview)
      );
  }
  return false;
}

function parseUnchecked(
  value: unknown,
): JuliaPreGpuCapabilityCensusParseResultV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "schema",
      "revision",
      "stage",
      "activationStatus",
      "runtimeIndexCanonicalSha256",
      "liveCensusContentHash",
      "publicationDecisionsContentHash",
      "evidenceContentHashes",
      "authorityContentHash",
      "rowMapContentHash",
      "sourceBindings",
      "rowCount",
      "statusCounts",
      "preGpuReadyCounts",
      "blockedCounts",
      "enhancementValidation",
      "notApplicableReviewPolicy",
      "rows",
      "contentHash",
    ]) ||
    value.schema !== JULIA_PRE_GPU_CAPABILITY_CENSUS_SCHEMA_V1 ||
    value.revision !== JULIA_PRE_GPU_CAPABILITY_CENSUS_REVISION_V1 ||
    value.stage !== "pre-gpu-closure" ||
    value.activationStatus !== "inactive-evidence-only" ||
    typeof value.runtimeIndexCanonicalSha256 !== "string" ||
    !SHA256.test(value.runtimeIndexCanonicalSha256) ||
    typeof value.liveCensusContentHash !== "string" ||
    !SHA256.test(value.liveCensusContentHash) ||
    typeof value.publicationDecisionsContentHash !== "string" ||
    !SHA256.test(value.publicationDecisionsContentHash) ||
    !record(value.evidenceContentHashes) ||
    !exactKeys(value.evidenceContentHashes, [
      "existingSystemC",
      "parameterBinding",
      "sourceSplit",
    ]) ||
    !Object.values(value.evidenceContentHashes).every(
      (hash) => typeof hash === "string" && SHA256.test(hash),
    ) ||
    typeof value.authorityContentHash !== "string" ||
    !SHA256.test(value.authorityContentHash) ||
    typeof value.rowMapContentHash !== "string" ||
    !SHA256.test(value.rowMapContentHash) ||
    !record(value.sourceBindings) ||
    !exactKeys(value.sourceBindings, JULIA_PRE_GPU_SOURCE_BINDING_PATHS_V1) ||
    !Object.values(value.sourceBindings).every(
      (hash) => typeof hash === "string" && SHA256.test(hash),
    ) ||
    value.rowCount !== JULIA_PRE_GPU_CAPABILITY_CENSUS_ROW_COUNT_V1 ||
    !parseCountRecord(value.statusCounts, [
      "supported",
      "candidate",
      "notApplicable",
      "unknown",
      "blocked",
    ]) ||
    value.statusCounts.supported !== 0 ||
    value.statusCounts.candidate !== 0 ||
    !parseCountRecord(value.preGpuReadyCounts, [
      "total",
      "classic",
      "generalized",
      "existingSystemC",
      "parameterBinding",
      "sourceSplit",
    ]) ||
    !parseCountRecord(value.blockedCounts, [
      "total",
      "existingSystemCTier1",
      "parameterBindingTier0",
      "sourceSplitTier1",
      "sourceSplitMutableAlias",
    ]) ||
    !record(value.enhancementValidation) ||
    !exactKeys(value.enhancementValidation, [
      "sourceSplitCandidateCount",
      "validatedCandidateCount",
      "rejectedCandidateCount",
      "candidateDefinitionsExactSet",
    ]) ||
    !nonNegativeInteger(value.enhancementValidation.sourceSplitCandidateCount) ||
    !nonNegativeInteger(value.enhancementValidation.validatedCandidateCount) ||
    !nonNegativeInteger(value.enhancementValidation.rejectedCandidateCount) ||
    value.enhancementValidation.candidateDefinitionsExactSet !== true ||
    !record(value.notApplicableReviewPolicy) ||
    !exactKeys(value.notApplicableReviewPolicy, [
      "requiredDecisions",
      "reviewedRowCount",
      "acceptedCount",
      "inconclusiveCount",
    ]) ||
    !Array.isArray(value.notApplicableReviewPolicy.requiredDecisions) ||
    value.notApplicableReviewPolicy.requiredDecisions.length !== 2 ||
    value.notApplicableReviewPolicy.requiredDecisions[0] !== "technical-author" ||
    value.notApplicableReviewPolicy.requiredDecisions[1] !== "independent-reviewer" ||
    !nonNegativeInteger(value.notApplicableReviewPolicy.reviewedRowCount) ||
    !nonNegativeInteger(value.notApplicableReviewPolicy.acceptedCount) ||
    !nonNegativeInteger(value.notApplicableReviewPolicy.inconclusiveCount) ||
    !Array.isArray(value.rows) ||
    value.rows.length !== JULIA_PRE_GPU_CAPABILITY_CENSUS_ROW_COUNT_V1 ||
    typeof value.contentHash !== "string" ||
    !SHA256.test(value.contentHash)
  )
    return { ok: false, code: "julia-pre-gpu-census-invalid" };

  const evidenceContentHashes = value.evidenceContentHashes as Readonly<{
    existingSystemC: string;
    parameterBinding: string;
    sourceSplit: string;
  }>;
  const sourceBindingHashes = value.sourceBindings as Readonly<
    Record<string, string>
  >;
  let previousId = "";
  const seen = new Set<string>();
  for (const row of value.rows) {
    if (
      !parseRow(row) ||
      row.formulaId <= previousId ||
      seen.has(row.formulaId)
    )
      return { ok: false, code: "julia-pre-gpu-census-invalid" };
    previousId = row.formulaId;
    seen.add(row.formulaId);
  }

  const rows = value.rows as JuliaPreGpuCapabilityRowV1[];
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
  const readySourceSplit = ready.filter(
    (row) => row.lane === "source-split",
  ).length;
  const rowMapContentHash = sha256HexSyncV1(
    canonicalJsonV1(rows.map(rowMapEntry), CANONICAL_NODE_BUDGET),
  );
  const authorityContentHash = sha256HexSyncV1(
    canonicalJsonV1(
      {
        runtimeIndexCanonicalSha256: value.runtimeIndexCanonicalSha256,
        liveCensusContentHash: value.liveCensusContentHash,
        publicationDecisionsContentHash: value.publicationDecisionsContentHash,
        evidenceContentHashes,
        sourceBindings: sourceBindingHashes,
      },
      CANONICAL_NODE_BUDGET,
    ),
  );
  if (
    value.authorityContentHash !== EXPECTED_AUTHORITY_CONTENT_HASH ||
    authorityContentHash !== EXPECTED_AUTHORITY_CONTENT_HASH ||
    value.rowMapContentHash !== EXPECTED_ROW_MAP_CONTENT_HASH ||
    rowMapContentHash !== EXPECTED_ROW_MAP_CONTENT_HASH ||
    evidenceContentHashes.existingSystemC !==
      EXPECTED_EXISTING_EVIDENCE_CONTENT_HASH ||
    evidenceContentHashes.parameterBinding !==
      EXPECTED_PARAMETER_EVIDENCE_CONTENT_HASH ||
    evidenceContentHashes.sourceSplit !==
      EXPECTED_SOURCE_SPLIT_EVIDENCE_CONTENT_HASH ||
    value.statusCounts.unknown !== 334 ||
    value.statusCounts.blocked !== 200 ||
    value.statusCounts.notApplicable !== 0 ||
    value.preGpuReadyCounts.total !== 185 ||
    value.preGpuReadyCounts.classic !== 185 ||
    value.preGpuReadyCounts.generalized !== 0 ||
    value.preGpuReadyCounts.existingSystemC !== 74 ||
    value.preGpuReadyCounts.parameterBinding !== 0 ||
    value.preGpuReadyCounts.sourceSplit !== 111 ||
    value.blockedCounts.total !== 200 ||
    value.blockedCounts.existingSystemCTier1 !== 2 ||
    value.blockedCounts.parameterBindingTier0 !== 175 ||
    value.blockedCounts.sourceSplitTier1 !== 6 ||
    value.blockedCounts.sourceSplitMutableAlias !== 17 ||
    value.enhancementValidation.sourceSplitCandidateCount !== 111 ||
    value.enhancementValidation.validatedCandidateCount !== 111 ||
    value.enhancementValidation.rejectedCandidateCount !== 0 ||
    value.notApplicableReviewPolicy.reviewedRowCount !== 149 ||
    value.notApplicableReviewPolicy.acceptedCount !== 0 ||
    value.notApplicableReviewPolicy.inconclusiveCount !== 149 ||
    value.statusCounts.unknown !== unknown ||
    value.statusCounts.blocked !== blocked ||
    value.statusCounts.notApplicable !== notApplicable ||
    unknown + blocked + notApplicable !== value.rowCount ||
    value.preGpuReadyCounts.total !== ready.length ||
    value.preGpuReadyCounts.classic !==
      ready.filter((row) => row.modeClass === "classic-julia").length ||
    value.preGpuReadyCounts.generalized !==
      ready.filter((row) => row.modeClass === "generalized-two-plane").length ||
    value.preGpuReadyCounts.existingSystemC !==
      ready.filter((row) => row.lane === "existing-system-c").length ||
    value.preGpuReadyCounts.parameterBinding !==
      ready.filter((row) => row.lane === "parameter-binding").length ||
    value.preGpuReadyCounts.sourceSplit !== readySourceSplit ||
    value.blockedCounts.total !== blocked ||
    value.blockedCounts.existingSystemCTier1 !== blockedExisting ||
    value.blockedCounts.parameterBindingTier0 !== blockedParameter ||
    value.blockedCounts.sourceSplitTier1 !== blockedSourceTier1 ||
    value.blockedCounts.sourceSplitMutableAlias !== blockedMutableAlias ||
    blockedExisting +
        blockedParameter +
        blockedSourceTier1 +
        blockedMutableAlias !==
      blocked ||
    value.enhancementValidation.sourceSplitCandidateCount !==
      readySourceSplit ||
    value.enhancementValidation.validatedCandidateCount !==
      readySourceSplit ||
    value.enhancementValidation.rejectedCandidateCount !== 0 ||
    value.notApplicableReviewPolicy.acceptedCount !== notApplicable ||
    value.notApplicableReviewPolicy.inconclusiveCount !== inconclusive ||
    value.notApplicableReviewPolicy.reviewedRowCount !==
      notApplicable + inconclusive ||
    rows.some((row) => {
      const expectedEvidenceHash =
        row.lane === "existing-system-c"
          ? evidenceContentHashes.existingSystemC
          : row.lane === "parameter-binding"
            ? evidenceContentHashes.parameterBinding
            : evidenceContentHashes.sourceSplit;
      return row.evidenceContentHash !== expectedEvidenceHash;
    })
  )
    return { ok: false, code: "julia-pre-gpu-census-invalid" };

  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  if (
    sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET)) !==
    value.contentHash
  )
    return { ok: false, code: "julia-pre-gpu-census-invalid" };

  return {
    ok: true,
    value: immutableJson(value) as JuliaPreGpuCapabilityCensusV1,
  };
}

export function parseJuliaPreGpuCapabilityCensusV1(
  value: unknown,
): JuliaPreGpuCapabilityCensusParseResultV1 {
  try {
    const snapshot = JSON.parse(
      canonicalJsonV1(value, CANONICAL_NODE_BUDGET),
    ) as unknown;
    return parseUnchecked(snapshot);
  } catch {
    return { ok: false, code: "julia-pre-gpu-census-invalid" };
  }
}

const parsed = parseJuliaPreGpuCapabilityCensusV1(censusAsset);
if (!parsed.ok) throw new Error(parsed.code);
export const JULIA_PRE_GPU_CAPABILITY_CENSUS_V1 = parsed.value;
