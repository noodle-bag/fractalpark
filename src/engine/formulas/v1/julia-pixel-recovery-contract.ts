import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA256_REFERENCE = /^sha256:[a-f0-9]{64}$/;
const CANONICAL_NODE_BUDGET = 262_144;

export const JULIA_PIXEL_RECOVERY_CONTRACT_SCHEMA_V1 =
  "fractalpark-julia-pixel-recovery-contract/v1" as const;
export const JULIA_PIXEL_RECOVERY_PROJECTION_SCHEMA_V1 =
  "fractalpark-julia-pixel-recovery-projection-row/v1" as const;
export const JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1 =
  "fractalpark-julia-pixel-activation-handoff/v1" as const;
export const JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2 =
  "fractalpark-julia-pixel-final-capability-census/v2" as const;
export const JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1 =
  "fractalpark-julia-pixel-final-authority-manifest/v1" as const;
export const JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 = 534 as const;
export const JULIA_PIXEL_RECOVERY_BASELINE_REPOSITORY_REVISION_V1 =
  "138d1e7f6c78b2d9aedb2811e01bcdb42cad757c" as const;
export const JULIA_PIXEL_RECOVERY_RUNTIME_INDEX_SHA256_V1 =
  "362f327b260f38ceb1d9afd7dc619d4ef010f8365ee84a8673ba1df6285fc3f5" as const;
export const JULIA_PIXEL_RECOVERY_LIVE_CENSUS_CONTENT_HASH_V1 =
  "e079815c5e8f865608dc6ec52121bbbe47857f2c2ecb9000080602ab5e54f197" as const;
export const JULIA_PIXEL_RECOVERY_PRE_GPU_CONTENT_HASH_V1 =
  "bd272c801ec22f7709bcc32213e72ec7402369804fa14df0209dd165dd804fe8" as const;
export const JULIA_PIXEL_RECOVERY_RENDERER_CONTENT_HASH_V1 =
  "650e19ec8915fec8ffe4b690411c3e28305ae12ce1766115f8f01cccda186db2" as const;
export const JULIA_PIXEL_RECOVERY_FINAL_V1_CONTENT_HASH_V1 =
  "1de7daa2195d9737e72135f7f4251c5d08e800060e459b4170825294427f36a0" as const;

export const JULIA_PIXEL_RECOVERY_ROLES_V1 = Object.freeze([
  "role:pixel-seed",
  "role:pixel-constant",
  "role:julia-constant",
  "role:derived-pixel-constant",
  "role:formula-parameter",
  "role:dynamic-orbit-state",
  "role:bailout-control",
  "role:unresolved",
] as const);
export type JuliaPixelRecoveryRoleV1 =
  (typeof JULIA_PIXEL_RECOVERY_ROLES_V1)[number];

export const JULIA_PIXEL_RECOVERY_MODE_CLASSES_V1 = Object.freeze([
  "classic-julia",
  "generalized-two-plane",
  "undetermined",
  "not-applicable",
] as const);
export type JuliaPixelRecoveryModeClassV1 =
  (typeof JULIA_PIXEL_RECOVERY_MODE_CLASSES_V1)[number];

export const JULIA_PIXEL_RECOVERY_SUPPORT_LANES_V1 = Object.freeze([
  "existing-system-c",
  "parameter-binding",
  "source-split-direct",
  "source-split-transitive",
  "state-separated",
  "none",
] as const);
export type JuliaPixelRecoverySupportLaneV1 =
  (typeof JULIA_PIXEL_RECOVERY_SUPPORT_LANES_V1)[number];

export const JULIA_PIXEL_RECOVERY_REMEDIATION_LANES_V1 = Object.freeze([
  "none",
  "canonical-rebind",
  "role-discovery",
  "mutable-state-separation",
  "tier1-numeric-diagnosis",
  "renderer-diagnosis",
  "identity-review",
] as const);
export type JuliaPixelRecoveryRemediationLaneV1 =
  (typeof JULIA_PIXEL_RECOVERY_REMEDIATION_LANES_V1)[number];

export const JULIA_PIXEL_RECOVERY_REWRITE_CLASSES_V1 = Object.freeze([
  "none",
  "E0-operational-equivalence",
  "E1-mathematical-identity",
  "identity-change",
] as const);
export type JuliaPixelRecoveryRewriteClassV1 =
  (typeof JULIA_PIXEL_RECOVERY_REWRITE_CLASSES_V1)[number];

export const JULIA_PIXEL_RECOVERY_FINAL_STATUSES_V1 = Object.freeze([
  "supported",
  "held",
  "unknown",
  "blocked",
  "not-applicable",
] as const);
export type JuliaPixelRecoveryFinalStatusV1 =
  (typeof JULIA_PIXEL_RECOVERY_FINAL_STATUSES_V1)[number];

export const JULIA_PIXEL_RECOVERY_EVIDENCE_STATES_V1 = Object.freeze([
  "not-required",
  "pending",
  "pass",
  "fail",
] as const);
export type JuliaPixelRecoveryEvidenceStateV1 =
  (typeof JULIA_PIXEL_RECOVERY_EVIDENCE_STATES_V1)[number];

export const JULIA_PIXEL_RECOVERY_AUTHORITY_STATES_V1 = Object.freeze([
  "draft",
  "sealed",
  "withdrawn",
  "superseded",
] as const);
export type JuliaPixelRecoveryAuthorityStateV1 =
  (typeof JULIA_PIXEL_RECOVERY_AUTHORITY_STATES_V1)[number];

export const JULIA_PIXEL_RECOVERY_DIMENSIONS_V1 = Object.freeze({
  roles: JULIA_PIXEL_RECOVERY_ROLES_V1,
  modeClasses: JULIA_PIXEL_RECOVERY_MODE_CLASSES_V1,
  supportLanes: JULIA_PIXEL_RECOVERY_SUPPORT_LANES_V1,
  remediationLanes: JULIA_PIXEL_RECOVERY_REMEDIATION_LANES_V1,
  rewriteClasses: JULIA_PIXEL_RECOVERY_REWRITE_CLASSES_V1,
  finalStatuses: JULIA_PIXEL_RECOVERY_FINAL_STATUSES_V1,
});

export const JULIA_PIXEL_RECOVERY_LEGAL_MATRIX_V1 = Object.freeze({
  supported: Object.freeze({
    modeClasses: Object.freeze(["classic-julia"]),
    supportLanes: Object.freeze(
      JULIA_PIXEL_RECOVERY_SUPPORT_LANES_V1.filter((lane) => lane !== "none"),
    ),
    rewriteClasses: Object.freeze([
      "none",
      "E0-operational-equivalence",
      "E1-mathematical-identity",
    ]),
    requiredEvidence: Object.freeze(["tier0", "tier1", "tier2"]),
    authorityState: "sealed",
  }),
  generalized: Object.freeze({
    forbiddenFinalStatuses: Object.freeze(["supported"]),
    productState: "held-by-default",
  }),
  e1: Object.freeze({
    requiredEvidence: Object.freeze([
      "identityReview",
      "e1Supplement",
      "e1SealedHoldout",
    ]),
    pendingFinalStatus: "held",
    failedFinalStatus: "blocked",
  }),
  identityChange: Object.freeze({
    supportLane: "none",
    forbiddenFinalStatuses: Object.freeze(["supported", "not-applicable"]),
    proposalRef: "required-outside-census",
  }),
  notApplicable: Object.freeze({
    supportLane: "none",
    requiredEvidence: Object.freeze(["notApplicableReview"]),
    authorityState: "sealed",
  }),
  candidateFinalStatusForbidden: true,
  unknownReachabilityTreatedAs: "reachable",
  finalInputsAllowedAuthorityStates: Object.freeze(["sealed"]),
  perIdPolicyFieldsForbidden: Object.freeze([
    "threshold",
    "thresholds",
    "tolerance",
    "tolerances",
    "whitelist",
    "allowlist",
  ]),
});

export const JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1 = Object.freeze({
  tier0: Object.freeze({
    requiredAuthorities: Object.freeze([
      "source",
      "identity",
      "rights",
      "safety-envelope",
    ]),
  }),
  tier1: Object.freeze({
    numericProfile: "standard32",
    points: Object.freeze([
      Object.freeze([-0.35, 0.2]),
      Object.freeze([0.12, -0.28]),
      Object.freeze([0.43, 0.11]),
    ]),
    constants: Object.freeze([
      Object.freeze([-0.7, 0.27]),
      Object.freeze([0.285, 0.01]),
      Object.freeze([-0.1542022, 0.6137691]),
    ]),
    depths: Object.freeze([1, 2, 4, 8, 16, 32, 64, 128]),
    requiredChecks: Object.freeze([
      "parameter-plane-contract",
      "deterministic",
      "finite-evidence",
      "pixel-sensitive",
      "constant-sensitive",
    ]),
  }),
  tier2: Object.freeze({
    browser: "Chromium",
    api: "WebGL2",
    rendererClass: "SwiftShader-software",
    numericProfile: "standard32",
    points: Object.freeze([
      Object.freeze([-0.35, 0.2]),
      Object.freeze([0.12, -0.28]),
      Object.freeze([0.43, 0.11]),
    ]),
    constants: Object.freeze([
      Object.freeze([-0.7, 0.27]),
      Object.freeze([0.285, 0.01]),
      Object.freeze([-0.1542022, 0.6137691]),
    ]),
    depths: Object.freeze([1, 2, 4, 8, 16, 32, 64, 128]),
    trace: Object.freeze({ orbitSteps: 128, stateDimensions: 18 }),
    image: Object.freeze({
      width: 8,
      height: 6,
      iterations: 32,
      constantCount: 2,
      pixelComparisons: 96,
      minimumDifferingPixels: 1,
    }),
    relativeTolerance: 0.005,
    deterministicDoubleDraw: true,
    fullFrameworkCappedWitness: true,
    tier3: Object.freeze({
      physicalDeviceSampleCount: 0,
      crossDeviceGuarantee: false,
    }),
  }),
});

export const JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1 = Object.freeze({
  metric: "per-step-complex-component-combined-error",
  absoluteTolerance: 0.000001,
  relativeTolerance: 0.0005,
  normalizationFloor: 1,
  maximumNormalizedComponentError: 1,
  maximumMeanNormalizedComponentError: 0.25,
  terminalEventExact: true,
  completedStepExact: true,
  terminalClassExact: true,
  baselineAndCandidateFinite: true,
  imageRelativeTolerance: 0.005,
  imageMinimumDifferingPixels: 1,
  perIdOverridesAllowed: false,
});

export const JULIA_PIXEL_RECOVERY_AUTHORITY_LIFECYCLE_V1 = Object.freeze({
  states: JULIA_PIXEL_RECOVERY_AUTHORITY_STATES_V1,
  immutable: true,
  mutableTransitionsForbidden: true,
  supersession: "new-manifest-reference-only",
  withdrawal: "new-manifest-reference-only",
  finalInputState: "sealed",
});

export const JULIA_PIXEL_ACTIVATION_HANDOFF_CONTRACT_V1 = Object.freeze({
  states: Object.freeze(["review-pending", "activation-eligible"]),
  finalCensusAuthorityState: "sealed",
  nonEmptyRegressionRequiresAcknowledgment: true,
  censusMutationForAcknowledgmentForbidden: true,
  consumerState: "activation-eligible",
  consumerBinding:
    "not-available-until-7E-H-independent-receipt-and-source-authority-verifier",
  consumerRowPredicate:
    "modeClass=classic-julia AND finalStatus=supported AND requiredReceipts=pass",
});

export interface JuliaPixelRecoveryAuthorityReferenceV1 {
  readonly authorityState: JuliaPixelRecoveryAuthorityStateV1;
  readonly supersededBy: string | null;
  readonly withdrawnBy: string | null;
}

export interface JuliaPixelRecoveryProjectionRowV1 {
  readonly schema: typeof JULIA_PIXEL_RECOVERY_PROJECTION_SCHEMA_V1;
  readonly formulaId: string;
  readonly roles: readonly JuliaPixelRecoveryRoleV1[];
  readonly modeClass: JuliaPixelRecoveryModeClassV1;
  readonly supportLane: JuliaPixelRecoverySupportLaneV1;
  readonly remediationLane: JuliaPixelRecoveryRemediationLaneV1;
  readonly rewriteClass: JuliaPixelRecoveryRewriteClassV1;
  readonly finalStatus: JuliaPixelRecoveryFinalStatusV1;
  readonly identityChangeProposalRef: string | null;
  readonly evidence: Readonly<{
    tier0: JuliaPixelRecoveryEvidenceStateV1;
    tier1: JuliaPixelRecoveryEvidenceStateV1;
    tier2: JuliaPixelRecoveryEvidenceStateV1;
    identityReview: JuliaPixelRecoveryEvidenceStateV1;
    e1Supplement: JuliaPixelRecoveryEvidenceStateV1;
    e1SealedHoldout: JuliaPixelRecoveryEvidenceStateV1;
    notApplicableReview: JuliaPixelRecoveryEvidenceStateV1;
  }>;
  readonly receipts: Readonly<{
    roleDiscovery: string;
    sourceAuthority: string | null;
    directPixelSeed: string | null;
    tier0: string | null;
    tier1: string | null;
    tier2: string | null;
    identityReview: string | null;
    e1Supplement: string | null;
    e1SealedHoldout: string | null;
    notApplicableReview: string | null;
  }>;
  readonly authority: JuliaPixelRecoveryAuthorityReferenceV1;
}

export interface JuliaPixelRecoveryContractV1 {
  readonly schema: typeof JULIA_PIXEL_RECOVERY_CONTRACT_SCHEMA_V1;
  readonly revision: 1;
  readonly stage: "contract-frozen";
  readonly authorityState: "sealed";
  readonly baselineRepositoryRevision: string;
  readonly lineage: Readonly<{
    rowCount: 534;
    runtimeIndexCanonicalSha256: string;
    orderedFormulaIds: readonly string[];
    orderedFormulaIdsDigest: string;
    liveCensusContentHash: string;
    preGpuContentHash: string;
    rendererEvidenceContentHash: string;
    finalCensusV1ContentHash: string;
  }>;
  readonly dimensions: typeof JULIA_PIXEL_RECOVERY_DIMENSIONS_V1;
  readonly legalMatrix: typeof JULIA_PIXEL_RECOVERY_LEGAL_MATRIX_V1;
  readonly baseEvidenceContract: typeof JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1;
  readonly baseEvidenceContractDigest: string;
  readonly e1SupplementContract: typeof JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1;
  readonly e1SupplementContractDigest: string;
  readonly changedRegionAnalyzer: Readonly<{
    schema: "fractalpark-julia-pixel-changed-region-analyzer/v1";
    revision: string;
    mapping: "source-diff-to-production-ir-node-and-def-use-region";
    reachability: "path-sensitive-static-over-approximation";
    unknownTreatment: "reachable";
    uncoveredReachableOrUnknownMaximum: 0;
  }>;
  readonly holdoutContract: Readonly<{
    schema: "fractalpark-julia-pixel-blind-holdout-contract/v1";
    generatorRevision: string;
    verifierRevision: string;
    stateSealerRevision: string;
    attemptTransitionRevision: string;
    historySchema: "fractalpark-julia-pixel-blind-holdout-history/v1";
    attemptLedgerSchema: "fractalpark-julia-pixel-holdout-attempt-ledger/v1";
    candidateManifestSchema: "fractalpark-julia-pixel-candidate-manifest/v1";
    attemptManifestSchema: "fractalpark-julia-pixel-holdout-attempt-manifest/v1";
    attemptReceiptSchema: "fractalpark-julia-pixel-holdout-attempt-receipt/v1";
    transitionStates: readonly ["pre-candidate", "wave-frozen", "sealed"];
    sealedCorpusDigest: string;
    caseKeySetDigest: string;
    caseCount: number;
    historicalCorpusDigests: readonly string[];
    historicalGeneratorRevisions: readonly string[];
    historicalCaseKeySetDigests: readonly string[];
    historicalCaseCounts: readonly number[];
    caseKeyIntersectionCount: 0;
    historyManifestDigest: string;
    attemptLedgerDigest: string;
    attemptCount: 0;
    maximumAttemptsPerRowPerWave: 1;
    disclosure: "schema-revisions-digests-counts-and-verdict-only";
  }>;
  readonly holdoutContractDigest: string;
  readonly authorityLifecycle: typeof JULIA_PIXEL_RECOVERY_AUTHORITY_LIFECYCLE_V1;
  readonly handoffContract: typeof JULIA_PIXEL_ACTIVATION_HANDOFF_CONTRACT_V1;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly contentHash: string;
}

export interface JuliaPixelActivationHandoffV1 {
  readonly schema: typeof JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1;
  readonly revision: 1;
  readonly authority: JuliaPixelRecoveryAuthorityReferenceV1;
  readonly handoffState: "review-pending" | "activation-eligible";
  readonly finalCensusContentHash: string;
  readonly finalCensusAuthorityState: "sealed";
  readonly authorityManifestContentHash: string;
  readonly supportedClassicRowSetDigest: string;
  readonly supportedClassicRowCount: number;
  readonly regressionSetDigest: string;
  readonly regressionCount: number;
  readonly maintainerAcknowledgmentReceiptDigest: string | null;
  readonly contentHash: string;
}

export interface JuliaPixelFinalCapabilityCensusV2 {
  readonly schema: typeof JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2;
  readonly revision: 2;
  readonly authority: JuliaPixelRecoveryAuthorityReferenceV1;
  readonly contractContentHash: string;
  readonly rowCount: 534;
  readonly rows: readonly JuliaPixelRecoveryProjectionRowV1[];
  readonly contentHash: string;
}

export interface JuliaPixelFinalAuthorityManifestV1 {
  readonly schema: typeof JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1;
  readonly revision: 1;
  readonly authority: JuliaPixelRecoveryAuthorityReferenceV1;
  readonly finalCensusContentHash: string;
  readonly inputAuthorityContentHashes: readonly string[];
  readonly contentHash: string;
}

export type JuliaPixelRecoveryParseResultV1<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "julia-pixel-recovery-invalid" };

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
    [...(keys as string[])].sort().join("|") === [...expected].sort().join("|")
  );
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (record(value)) {
    const result: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) result[key] = immutable(child);
    return Object.freeze(result) as T;
  }
  return value;
}

function member<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function exactCanonical(left: unknown, right: unknown): boolean {
  try {
    return canonicalJsonV1(left, CANONICAL_NODE_BUDGET) ===
      canonicalJsonV1(right, CANONICAL_NODE_BUDGET);
  } catch {
    return false;
  }
}

function parseAuthority(value: unknown): JuliaPixelRecoveryAuthorityReferenceV1 | undefined {
  if (
    !record(value) ||
    !exactKeys(value, ["authorityState", "supersededBy", "withdrawnBy"]) ||
    !member(JULIA_PIXEL_RECOVERY_AUTHORITY_STATES_V1, value.authorityState) ||
    !(
      value.supersededBy === null ||
      (typeof value.supersededBy === "string" && SHA256_REFERENCE.test(value.supersededBy))
    ) ||
    !(
      value.withdrawnBy === null ||
      (typeof value.withdrawnBy === "string" && SHA256_REFERENCE.test(value.withdrawnBy))
    )
  )
    return undefined;
  if (
    (value.authorityState === "superseded" &&
      (value.supersededBy === null || value.withdrawnBy !== null)) ||
    (value.authorityState === "withdrawn" &&
      (value.withdrawnBy === null || value.supersededBy !== null)) ||
    ((value.authorityState === "draft" || value.authorityState === "sealed") &&
      (value.supersededBy !== null || value.withdrawnBy !== null))
  )
    return undefined;
  return {
    authorityState: value.authorityState,
    supersededBy: value.supersededBy,
    withdrawnBy: value.withdrawnBy,
  };
}

function evidenceState(value: unknown): value is JuliaPixelRecoveryEvidenceStateV1 {
  return member(JULIA_PIXEL_RECOVERY_EVIDENCE_STATES_V1, value);
}

function receiptReference(value: unknown): value is string {
  return typeof value === "string" && SHA256_REFERENCE.test(value);
}

function optionalReceiptReference(value: unknown): value is string | null {
  return value === null || receiptReference(value);
}

function evidenceReceiptConsistent(
  state: JuliaPixelRecoveryEvidenceStateV1,
  receipt: string | null,
): boolean {
  return state === "pass" || state === "fail" ? receipt !== null : receipt === null;
}

function receiptsConsistent(row: JuliaPixelRecoveryProjectionRowV1): boolean {
  const { evidence, receipts } = row;
  return (
    evidenceReceiptConsistent(evidence.tier0, receipts.tier0) &&
    evidenceReceiptConsistent(evidence.tier1, receipts.tier1) &&
    evidenceReceiptConsistent(evidence.tier2, receipts.tier2) &&
    evidenceReceiptConsistent(evidence.identityReview, receipts.identityReview) &&
    evidenceReceiptConsistent(evidence.e1Supplement, receipts.e1Supplement) &&
    evidenceReceiptConsistent(
      evidence.e1SealedHoldout,
      receipts.e1SealedHoldout,
    ) &&
    evidenceReceiptConsistent(
      evidence.notApplicableReview,
      receipts.notApplicableReview,
    ) &&
    (evidence.tier0 !== "pass" || receipts.sourceAuthority !== null) &&
    (row.modeClass !== "classic-julia" || receipts.directPixelSeed !== null) &&
    (row.modeClass !== "generalized-two-plane" || receipts.directPixelSeed === null)
  );
}

function orderedRoles(value: unknown): value is readonly JuliaPixelRecoveryRoleV1[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const indices = value.map((role) => JULIA_PIXEL_RECOVERY_ROLES_V1.indexOf(role));
  return indices.every(
    (index, position) => index >= 0 && (position === 0 || indices[position - 1]! < index),
  );
}

function laneRolesValid(row: JuliaPixelRecoveryProjectionRowV1): boolean {
  const roles = new Set(row.roles);
  if (row.supportLane === "none") return true;
  if (row.modeClass === "classic-julia" && !roles.has("role:pixel-seed")) return false;
  if (row.supportLane === "existing-system-c") return roles.has("role:julia-constant");
  if (row.supportLane === "parameter-binding")
    return roles.has("role:formula-parameter") && roles.has("role:julia-constant");
  if (row.supportLane === "source-split-direct")
    return roles.has("role:pixel-constant");
  if (row.supportLane === "source-split-transitive")
    return roles.has("role:derived-pixel-constant");
  return (
    roles.has("role:dynamic-orbit-state") &&
    roles.has("role:derived-pixel-constant")
  );
}

function projectionLegal(row: JuliaPixelRecoveryProjectionRowV1): boolean {
  const { evidence } = row;
  if (
    row.authority.authorityState !== "sealed" ||
    !laneRolesValid(row) ||
    !receiptsConsistent(row)
  )
    return false;
  if (
    row.modeClass === "generalized-two-plane" && row.finalStatus === "supported"
  )
    return false;
  if (row.modeClass === "not-applicable" && row.finalStatus !== "not-applicable")
    return false;
  if (row.rewriteClass === "identity-change") {
    if (
      row.supportLane !== "none" ||
      row.identityChangeProposalRef === null ||
      row.finalStatus === "supported" ||
      row.finalStatus === "not-applicable"
    )
      return false;
  } else if (row.identityChangeProposalRef !== null) return false;
  if (row.finalStatus === "not-applicable") {
    if (
      row.supportLane !== "none" ||
      evidence.notApplicableReview !== "pass" ||
      row.receipts.notApplicableReview === null
    )
      return false;
  }
  if (row.rewriteClass === "E1-mathematical-identity") {
    const states = [
      evidence.identityReview,
      evidence.e1Supplement,
      evidence.e1SealedHoldout,
    ];
    if (states.includes("pending") && row.finalStatus !== "held") return false;
    if (states.includes("fail") && row.finalStatus !== "blocked") return false;
  } else if (
    evidence.e1Supplement !== "not-required" ||
    evidence.e1SealedHoldout !== "not-required"
  )
    return false;
  if (row.finalStatus !== "supported") return true;
  return (
    row.modeClass === "classic-julia" &&
    row.supportLane !== "none" &&
    row.rewriteClass !== "identity-change" &&
    !row.roles.includes("role:unresolved") &&
    row.receipts.sourceAuthority !== null &&
    row.receipts.roleDiscovery !== null &&
    row.receipts.directPixelSeed !== null &&
    row.receipts.tier0 !== null &&
    row.receipts.tier1 !== null &&
    row.receipts.tier2 !== null &&
    evidence.tier0 === "pass" &&
    evidence.tier1 === "pass" &&
    evidence.tier2 === "pass" &&
    (row.rewriteClass !== "E1-mathematical-identity" ||
      (evidence.identityReview === "pass" &&
        evidence.e1Supplement === "pass" &&
        evidence.e1SealedHoldout === "pass" &&
        row.receipts.identityReview !== null &&
        row.receipts.e1Supplement !== null &&
        row.receipts.e1SealedHoldout !== null))
  );
}

export function parseJuliaPixelRecoveryProjectionRowV1(
  value: unknown,
): JuliaPixelRecoveryParseResultV1<JuliaPixelRecoveryProjectionRowV1> {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "formulaId",
        "roles",
        "modeClass",
        "supportLane",
        "remediationLane",
        "rewriteClass",
        "finalStatus",
        "identityChangeProposalRef",
        "evidence",
        "receipts",
        "authority",
      ]) ||
      value.schema !== JULIA_PIXEL_RECOVERY_PROJECTION_SCHEMA_V1 ||
      typeof value.formulaId !== "string" ||
      !UUID_V5.test(value.formulaId) ||
      !orderedRoles(value.roles) ||
      !member(JULIA_PIXEL_RECOVERY_MODE_CLASSES_V1, value.modeClass) ||
      !member(JULIA_PIXEL_RECOVERY_SUPPORT_LANES_V1, value.supportLane) ||
      !member(JULIA_PIXEL_RECOVERY_REMEDIATION_LANES_V1, value.remediationLane) ||
      !member(JULIA_PIXEL_RECOVERY_REWRITE_CLASSES_V1, value.rewriteClass) ||
      !member(JULIA_PIXEL_RECOVERY_FINAL_STATUSES_V1, value.finalStatus) ||
      !(
        value.identityChangeProposalRef === null ||
        (typeof value.identityChangeProposalRef === "string" &&
          SHA256_REFERENCE.test(value.identityChangeProposalRef))
      ) ||
      !record(value.evidence) ||
      !exactKeys(value.evidence, [
        "tier0",
        "tier1",
        "tier2",
        "identityReview",
        "e1Supplement",
        "e1SealedHoldout",
        "notApplicableReview",
      ]) ||
      !Object.values(value.evidence).every(evidenceState) ||
      !record(value.receipts) ||
      !exactKeys(value.receipts, [
        "roleDiscovery",
        "sourceAuthority",
        "directPixelSeed",
        "tier0",
        "tier1",
        "tier2",
        "identityReview",
        "e1Supplement",
        "e1SealedHoldout",
        "notApplicableReview",
      ]) ||
      !receiptReference(value.receipts.roleDiscovery) ||
      ![
        value.receipts.sourceAuthority,
        value.receipts.directPixelSeed,
        value.receipts.tier0,
        value.receipts.tier1,
        value.receipts.tier2,
        value.receipts.identityReview,
        value.receipts.e1Supplement,
        value.receipts.e1SealedHoldout,
        value.receipts.notApplicableReview,
      ].every(optionalReceiptReference)
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const authority = parseAuthority(value.authority);
    if (!authority) return { ok: false, code: "julia-pixel-recovery-invalid" };
    const row = immutable({ ...value, authority }) as JuliaPixelRecoveryProjectionRowV1;
    return projectionLegal(row)
      ? { ok: true, value: row }
      : { ok: false, code: "julia-pixel-recovery-invalid" };
  } catch {
    return { ok: false, code: "julia-pixel-recovery-invalid" };
  }
}

export function parseJuliaPixelRecoveryContractV1(
  value: unknown,
): JuliaPixelRecoveryParseResultV1<JuliaPixelRecoveryContractV1> {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "revision",
        "stage",
        "authorityState",
        "baselineRepositoryRevision",
        "lineage",
        "dimensions",
        "legalMatrix",
        "baseEvidenceContract",
        "baseEvidenceContractDigest",
        "e1SupplementContract",
        "e1SupplementContractDigest",
        "changedRegionAnalyzer",
        "holdoutContract",
        "holdoutContractDigest",
        "authorityLifecycle",
        "handoffContract",
        "sourceBindings",
        "contentHash",
      ]) ||
      value.schema !== JULIA_PIXEL_RECOVERY_CONTRACT_SCHEMA_V1 ||
      value.revision !== 1 ||
      value.stage !== "contract-frozen" ||
      value.authorityState !== "sealed" ||
      value.baselineRepositoryRevision !==
        JULIA_PIXEL_RECOVERY_BASELINE_REPOSITORY_REVISION_V1 ||
      !record(value.lineage) ||
      !exactKeys(value.lineage, [
        "rowCount",
        "runtimeIndexCanonicalSha256",
        "orderedFormulaIds",
        "orderedFormulaIdsDigest",
        "liveCensusContentHash",
        "preGpuContentHash",
        "rendererEvidenceContentHash",
        "finalCensusV1ContentHash",
      ]) ||
      value.lineage.rowCount !== JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 ||
      value.lineage.runtimeIndexCanonicalSha256 !==
        JULIA_PIXEL_RECOVERY_RUNTIME_INDEX_SHA256_V1 ||
      !Array.isArray(value.lineage.orderedFormulaIds) ||
      value.lineage.orderedFormulaIds.length !== JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 ||
      !value.lineage.orderedFormulaIds.every(
        (id, index, values) =>
          typeof id === "string" &&
          UUID_V5.test(id) &&
          (index === 0 || values[index - 1]! < id),
      ) ||
      typeof value.lineage.orderedFormulaIdsDigest !== "string" ||
      value.lineage.orderedFormulaIdsDigest !==
        sha256HexSyncV1(
          canonicalJsonV1(value.lineage.orderedFormulaIds, 4_096),
        ) ||
      value.lineage.liveCensusContentHash !==
        JULIA_PIXEL_RECOVERY_LIVE_CENSUS_CONTENT_HASH_V1 ||
      value.lineage.preGpuContentHash !==
        JULIA_PIXEL_RECOVERY_PRE_GPU_CONTENT_HASH_V1 ||
      value.lineage.rendererEvidenceContentHash !==
        JULIA_PIXEL_RECOVERY_RENDERER_CONTENT_HASH_V1 ||
      value.lineage.finalCensusV1ContentHash !==
        JULIA_PIXEL_RECOVERY_FINAL_V1_CONTENT_HASH_V1 ||
      !exactCanonical(value.dimensions, JULIA_PIXEL_RECOVERY_DIMENSIONS_V1) ||
      !exactCanonical(value.legalMatrix, JULIA_PIXEL_RECOVERY_LEGAL_MATRIX_V1) ||
      !exactCanonical(
        value.baseEvidenceContract,
        JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1,
      ) ||
      value.baseEvidenceContractDigest !==
        sha256HexSyncV1(
          canonicalJsonV1(JULIA_PIXEL_RECOVERY_BASE_EVIDENCE_CONTRACT_V1),
        ) ||
      !exactCanonical(
        value.e1SupplementContract,
        JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1,
      ) ||
      value.e1SupplementContractDigest !==
        sha256HexSyncV1(
          canonicalJsonV1(JULIA_PIXEL_RECOVERY_E1_SUPPLEMENT_CONTRACT_V1),
        ) ||
      !record(value.changedRegionAnalyzer) ||
      !exactKeys(value.changedRegionAnalyzer, [
        "schema",
        "revision",
        "mapping",
        "reachability",
        "unknownTreatment",
        "uncoveredReachableOrUnknownMaximum",
      ]) ||
      value.changedRegionAnalyzer.schema !==
        "fractalpark-julia-pixel-changed-region-analyzer/v1" ||
      typeof value.changedRegionAnalyzer.revision !== "string" ||
      !SHA256.test(value.changedRegionAnalyzer.revision) ||
      value.changedRegionAnalyzer.mapping !==
        "source-diff-to-production-ir-node-and-def-use-region" ||
      value.changedRegionAnalyzer.reachability !==
        "path-sensitive-static-over-approximation" ||
      value.changedRegionAnalyzer.unknownTreatment !== "reachable" ||
      value.changedRegionAnalyzer.uncoveredReachableOrUnknownMaximum !== 0 ||
      !record(value.holdoutContract) ||
      !exactKeys(value.holdoutContract, [
        "schema",
        "generatorRevision",
        "verifierRevision",
        "stateSealerRevision",
        "attemptTransitionRevision",
        "historySchema",
        "attemptLedgerSchema",
        "candidateManifestSchema",
        "attemptManifestSchema",
        "attemptReceiptSchema",
        "transitionStates",
        "sealedCorpusDigest",
        "caseKeySetDigest",
        "caseCount",
        "historicalCorpusDigests",
        "historicalGeneratorRevisions",
        "historicalCaseKeySetDigests",
        "historicalCaseCounts",
        "caseKeyIntersectionCount",
        "historyManifestDigest",
        "attemptLedgerDigest",
        "attemptCount",
        "maximumAttemptsPerRowPerWave",
        "disclosure",
      ]) ||
      value.holdoutContract.schema !==
        "fractalpark-julia-pixel-blind-holdout-contract/v1" ||
      value.holdoutContract.historySchema !==
        "fractalpark-julia-pixel-blind-holdout-history/v1" ||
      value.holdoutContract.attemptLedgerSchema !==
        "fractalpark-julia-pixel-holdout-attempt-ledger/v1" ||
      value.holdoutContract.candidateManifestSchema !==
        "fractalpark-julia-pixel-candidate-manifest/v1" ||
      value.holdoutContract.attemptManifestSchema !==
        "fractalpark-julia-pixel-holdout-attempt-manifest/v1" ||
      value.holdoutContract.attemptReceiptSchema !==
        "fractalpark-julia-pixel-holdout-attempt-receipt/v1" ||
      !exactCanonical(value.holdoutContract.transitionStates, [
        "pre-candidate",
        "wave-frozen",
        "sealed",
      ]) ||
      ![
        value.holdoutContract.generatorRevision,
        value.holdoutContract.verifierRevision,
        value.holdoutContract.stateSealerRevision,
        value.holdoutContract.attemptTransitionRevision,
        value.holdoutContract.sealedCorpusDigest,
        value.holdoutContract.caseKeySetDigest,
        value.holdoutContract.historyManifestDigest,
        value.holdoutContract.attemptLedgerDigest,
      ].every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
      !Number.isSafeInteger(value.holdoutContract.caseCount) ||
      (value.holdoutContract.caseCount as number) <= 0 ||
      !Array.isArray(value.holdoutContract.historicalCorpusDigests) ||
      !Array.isArray(value.holdoutContract.historicalGeneratorRevisions) ||
      !Array.isArray(value.holdoutContract.historicalCaseKeySetDigests) ||
      !Array.isArray(value.holdoutContract.historicalCaseCounts) ||
      value.holdoutContract.historicalCorpusDigests.length !==
        value.holdoutContract.historicalCaseKeySetDigests.length ||
      value.holdoutContract.historicalCorpusDigests.length !==
        value.holdoutContract.historicalGeneratorRevisions.length ||
      value.holdoutContract.historicalCorpusDigests.length !==
        value.holdoutContract.historicalCaseCounts.length ||
      ![
        ...value.holdoutContract.historicalCorpusDigests,
        ...value.holdoutContract.historicalGeneratorRevisions,
        ...value.holdoutContract.historicalCaseKeySetDigests,
      ].every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
      !value.holdoutContract.historicalCaseCounts.every(
        (entry) => Number.isSafeInteger(entry) && entry > 0,
      ) ||
      new Set(value.holdoutContract.historicalCorpusDigests).size !==
        value.holdoutContract.historicalCorpusDigests.length ||
      value.holdoutContract.historicalCorpusDigests.includes(
        value.holdoutContract.sealedCorpusDigest,
      ) ||
      value.holdoutContract.caseKeyIntersectionCount !== 0 ||
      value.holdoutContract.attemptCount !== 0 ||
      value.holdoutContract.maximumAttemptsPerRowPerWave !== 1 ||
      value.holdoutContract.disclosure !==
        "schema-revisions-digests-counts-and-verdict-only" ||
      typeof value.holdoutContractDigest !== "string" ||
      value.holdoutContractDigest !==
        sha256HexSyncV1(canonicalJsonV1(value.holdoutContract)) ||
      !exactCanonical(
        value.authorityLifecycle,
        JULIA_PIXEL_RECOVERY_AUTHORITY_LIFECYCLE_V1,
      ) ||
      !exactCanonical(
        value.handoffContract,
        JULIA_PIXEL_ACTIVATION_HANDOFF_CONTRACT_V1,
      ) ||
      !record(value.sourceBindings) ||
      Object.keys(value.sourceBindings).length === 0 ||
      !Object.values(value.sourceBindings).every(
        (entry) => typeof entry === "string" && SHA256.test(entry),
      ) ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash)
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const content = { ...value };
    delete content.contentHash;
    if (
      value.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    return {
      ok: true,
      value: immutable(value) as unknown as JuliaPixelRecoveryContractV1,
    };
  } catch {
    return { ok: false, code: "julia-pixel-recovery-invalid" };
  }
}

export function parseJuliaPixelActivationHandoffV1(
  value: unknown,
): JuliaPixelRecoveryParseResultV1<JuliaPixelActivationHandoffV1> {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "revision",
        "authority",
        "handoffState",
        "finalCensusContentHash",
        "finalCensusAuthorityState",
        "authorityManifestContentHash",
        "supportedClassicRowSetDigest",
        "supportedClassicRowCount",
        "regressionSetDigest",
        "regressionCount",
        "maintainerAcknowledgmentReceiptDigest",
        "contentHash",
      ]) ||
      value.schema !== JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1 ||
      value.revision !== 1 ||
      (value.handoffState !== "review-pending" &&
        value.handoffState !== "activation-eligible") ||
      ![
        value.finalCensusContentHash,
        value.authorityManifestContentHash,
        value.supportedClassicRowSetDigest,
        value.regressionSetDigest,
        value.contentHash,
      ].every((entry) => typeof entry === "string" && SHA256.test(entry)) ||
      value.finalCensusAuthorityState !== "sealed" ||
      !Number.isSafeInteger(value.supportedClassicRowCount) ||
      (value.supportedClassicRowCount as number) < 0 ||
      (value.supportedClassicRowCount as number) > JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 ||
      !Number.isSafeInteger(value.regressionCount) ||
      (value.regressionCount as number) < 0 ||
      (value.regressionCount as number) > 170 ||
      !(
        value.maintainerAcknowledgmentReceiptDigest === null ||
        (typeof value.maintainerAcknowledgmentReceiptDigest === "string" &&
          SHA256.test(value.maintainerAcknowledgmentReceiptDigest))
      )
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const authority = parseAuthority(value.authority);
    if (!authority || authority.authorityState !== "sealed")
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    if (
      (value.handoffState === "review-pending" &&
        (value.regressionCount === 0 ||
          value.maintainerAcknowledgmentReceiptDigest !== null)) ||
      (value.handoffState === "activation-eligible" &&
        (value.regressionCount as number) > 0 &&
        value.maintainerAcknowledgmentReceiptDigest === null)
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const content = { ...value };
    delete content.contentHash;
    if (value.contentHash !== sha256HexSyncV1(canonicalJsonV1(content)))
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    return {
      ok: true,
      value: immutable({ ...value, authority }) as JuliaPixelActivationHandoffV1,
    };
  } catch {
    return { ok: false, code: "julia-pixel-recovery-invalid" };
  }
}

export function parseJuliaPixelFinalCapabilityCensusV2(
  value: unknown,
  contractValue: unknown,
): JuliaPixelRecoveryParseResultV1<JuliaPixelFinalCapabilityCensusV2> {
  try {
    const contract = parseJuliaPixelRecoveryContractV1(contractValue);
    if (
      !contract.ok ||
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "revision",
        "authority",
        "contractContentHash",
        "rowCount",
        "rows",
        "contentHash",
      ]) ||
      value.schema !== JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2 ||
      value.revision !== 2 ||
      value.contractContentHash !== contract.value.contentHash ||
      value.rowCount !== JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 ||
      !Array.isArray(value.rows) ||
      value.rows.length !== JULIA_PIXEL_RECOVERY_ROW_COUNT_V1 ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash)
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const authority = parseAuthority(value.authority);
    if (!authority || authority.authorityState !== "sealed")
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const rows: JuliaPixelRecoveryProjectionRowV1[] = [];
    for (let index = 0; index < value.rows.length; index++) {
      const parsed = parseJuliaPixelRecoveryProjectionRowV1(value.rows[index]);
      if (
        !parsed.ok ||
        parsed.value.formulaId !== contract.value.lineage.orderedFormulaIds[index]
      )
        return { ok: false, code: "julia-pixel-recovery-invalid" };
      rows.push(parsed.value);
    }
    const content = { ...value };
    delete content.contentHash;
    if (
      value.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    return {
      ok: true,
      value: immutable({ ...value, authority, rows }) as unknown as JuliaPixelFinalCapabilityCensusV2,
    };
  } catch {
    return { ok: false, code: "julia-pixel-recovery-invalid" };
  }
}

export function parseJuliaPixelFinalAuthorityManifestV1(
  value: unknown,
): JuliaPixelRecoveryParseResultV1<JuliaPixelFinalAuthorityManifestV1> {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "revision",
        "authority",
        "finalCensusContentHash",
        "inputAuthorityContentHashes",
        "contentHash",
      ]) ||
      value.schema !== JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1 ||
      value.revision !== 1 ||
      typeof value.finalCensusContentHash !== "string" ||
      !SHA256.test(value.finalCensusContentHash) ||
      !Array.isArray(value.inputAuthorityContentHashes) ||
      value.inputAuthorityContentHashes.length === 0 ||
      !value.inputAuthorityContentHashes.every(
        (entry, index, values) =>
          typeof entry === "string" &&
          SHA256.test(entry) &&
          (index === 0 || values[index - 1]! < entry),
      ) ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash)
    )
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const authority = parseAuthority(value.authority);
    if (!authority || authority.authorityState !== "sealed")
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    const content = { ...value };
    delete content.contentHash;
    if (value.contentHash !== sha256HexSyncV1(canonicalJsonV1(content, 131_072)))
      return { ok: false, code: "julia-pixel-recovery-invalid" };
    return {
      ok: true,
      value: immutable({ ...value, authority }) as unknown as JuliaPixelFinalAuthorityManifestV1,
    };
  } catch {
    return { ok: false, code: "julia-pixel-recovery-invalid" };
  }
}
