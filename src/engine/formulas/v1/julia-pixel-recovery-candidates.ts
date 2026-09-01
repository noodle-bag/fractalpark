import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";
import {
  JULIA_PIXEL_RECOVERY_CANDIDATE_ANALYZER_V1,
  type JuliaPixelRecoveryCandidateHoldReasonV1,
  type JuliaPixelRecoveryCandidateRewriteKindV1,
} from "./julia-pixel-recovery-candidate";

export const JULIA_PIXEL_RECOVERY_CANDIDATES_SCHEMA_V1 =
  "fractalpark-julia-pixel-recovery-candidates/v1" as const;
export const JULIA_PIXEL_RECOVERY_CANDIDATES_ROW_COUNT_V1 = 534 as const;
export const JULIA_PIXEL_RECOVERY_CANDIDATE_COUNT_V1 = 159 as const;
export const JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1 =
  "julia-pixel-recovery-candidates/definitions" as const;

export const JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1 =
  Object.freeze([
    "public/formula-library/v1/runtime/published/index.json",
    "resources/formula-library/v1/julia-parameter-authority.v1.json",
    "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
    "resources/formula-library/v1/julia-pixel-role-census.v1.json",
    "resources/formula-library/v1/publication-decisions.json",
    "scripts/build-julia-pixel-recovery-candidates.ts",
    "scripts/verify-julia-pixel-recovery-candidates.ts",
    "src/engine/formulas/v1/julia-binding.ts",
    "src/engine/formulas/v1/julia-cpu-harness.ts",
    "src/engine/formulas/v1/julia-parameter-authority.ts",
    "src/engine/formulas/v1/julia-pixel-changed-region.ts",
    "src/engine/formulas/v1/julia-pixel-recovery-candidate.ts",
    "src/engine/formulas/v1/julia-pixel-recovery-candidates.ts",
    "src/engine/formulas/v1/julia-pixel-role-analyzer.ts",
    "src/engine/formulas/v1/publication-decisions.ts",
    "src/engine/formulas/v1/published-runtime.ts",
    "src/engine/formulas/v1/revisions.ts",
    "src/engine/formulas/v1/safety-envelope.ts",
    "src/engine/frm/v1.ts",
  ] as const);

export type JuliaPixelRecoveryCandidateRowV1 = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  roleReceipt: string;
  status: "candidate";
  rewrite: Readonly<{
    kind: JuliaPixelRecoveryCandidateRewriteKindV1;
    constantTarget: string | null;
    provenanceDepth: number;
    recurrenceReadCount: number;
    analyzerVersion: typeof JULIA_PIXEL_RECOVERY_CANDIDATE_ANALYZER_V1;
  }>;
  candidate: Readonly<{
    sourceRevision: string;
    semanticHash: string;
    definitionPath: string;
    binding: Readonly<{ kind: "source-split"; sourceRevision: string }>;
    sourceAuthority: "isolated-content-addressed-draft";
    activation: "inactive-candidate";
  }>;
  identity: Readonly<{
    formulaNamePreserved: true;
    parameterSchemaPreserved: true;
    terminationPreserved: true;
  }>;
  rights: Readonly<{
    rightsStatus: string;
    publicationDecision: "publish";
    implementationBasis: string;
    leakageScanStatus: "passed";
  }>;
  e0: Readonly<{
    evidenceClass: "E0-parameter-plane-bit-identity";
    parameterPlaneBitIdentical: true;
    changedRegionAnalyzerRevision: string;
    analysisContentHash: string;
    coverageContentHash: string;
    changedRegionCount: number;
    reachableOrUnknownRegionCount: number;
    coveredRegionCount: number;
    uncoveredReachableOrUnknownRegionCount: 0;
    coverageBasis: "static-role-plus-E0-parameter-identity";
  }>;
  authority: Readonly<{
    authorityState: "draft";
    supersededBy: null;
    withdrawnBy: null;
  }>;
}>;

export type JuliaPixelRecoveryPriorLaneRowV1 = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  roleReceipt: string;
  status: "prior-lane";
  priorLane: "existing-system-c" | "parameter-binding";
}>;

export type JuliaPixelRecoveryHeldRowV1 = Readonly<{
  formulaId: string;
  baselineSourceRevision: string;
  baselineSemanticHash: string;
  roleReceipt: string;
  status: "held";
  reasonCode: JuliaPixelRecoveryCandidateHoldReasonV1;
}>;

export type JuliaPixelRecoveryCandidatesRowV1 =
  | JuliaPixelRecoveryCandidateRowV1
  | JuliaPixelRecoveryPriorLaneRowV1
  | JuliaPixelRecoveryHeldRowV1;

export interface JuliaPixelRecoveryCandidatesAssetV1 {
  readonly schema: typeof JULIA_PIXEL_RECOVERY_CANDIDATES_SCHEMA_V1;
  readonly revision: 1;
  readonly stage: "candidate-generation";
  readonly authority: Readonly<{
    authorityState: "draft";
    supersededBy: null;
    withdrawnBy: null;
  }>;
  readonly activationStatus: "inactive-candidate-only";
  readonly candidateSetState: "draft-not-wave-frozen";
  readonly waveId: null;
  readonly candidateDefinitionsRoot: typeof JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1;
  readonly runtimeIndexCanonicalSha256: string;
  readonly recoveryContractContentHash: string;
  readonly roleCensusContentHash: string;
  readonly parameterAuthorityContentHash: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: 534;
  readonly counts: Readonly<{
    priorLaneFormulaCount: 251;
    candidateFormulaCount: 159;
    heldFormulaCount: 124;
    candidateDefinitionCount: 159;
    stateSeparatedCandidateCount: 0;
    literalCandidateCount: 0;
    e1ReviewPackageCount: 0;
  }>;
  readonly rewriteCounts: Readonly<{
    directPixelConstant: 61;
    transitivePixelConstant: 98;
    transitiveDepthOne: 95;
    transitiveDepthTwo: 3;
  }>;
  readonly heldReasonCounts: Readonly<{
    generalizedTwoPlane: 27;
    mutablePixelAlias: 30;
    constantRoleNotProven: 49;
    constantRoleOutsideRecurrence: 11;
    constantDefinitionNotUnique: 6;
    constantInitializationControlNotProven: 1;
  }>;
  readonly rows: readonly JuliaPixelRecoveryCandidatesRowV1[];
  readonly contentHash: string;
}

export type JuliaPixelRecoveryCandidatesParseResultV1 =
  | { readonly ok: true; readonly value: JuliaPixelRecoveryCandidatesAssetV1 }
  | {
      readonly ok: false;
      readonly code: "julia-pixel-recovery-candidates-invalid";
    };

type JsonRecord = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ROLE_RECEIPT = /^sha256:[a-f0-9]{64}$/;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}
function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key) => typeof key === "string") &&
    [...(keys as string[])].sort().join("|") ===
      [...expected].sort().join("|")
  );
}
function dense(value: readonly unknown[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== value.length + 1 || !ownKeys.includes("length"))
    return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) return false;
  }
  return true;
}
function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (record(value)) {
    const output: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) output[key] = immutable(child);
    return Object.freeze(output) as T;
  }
  return value;
}
function authority(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, ["authorityState", "supersededBy", "withdrawnBy"]) &&
    value.authorityState === "draft" &&
    value.supersededBy === null &&
    value.withdrawnBy === null
  );
}
function commonRow(value: JsonRecord): boolean {
  return (
    typeof value.formulaId === "string" &&
    UUID_V5.test(value.formulaId) &&
    typeof value.baselineSourceRevision === "string" &&
    SHA256.test(value.baselineSourceRevision) &&
    typeof value.baselineSemanticHash === "string" &&
    SHA256.test(value.baselineSemanticHash) &&
    typeof value.roleReceipt === "string" &&
    ROLE_RECEIPT.test(value.roleReceipt)
  );
}

function parsePriorRow(value: JsonRecord): boolean {
  return (
    exactKeys(value, [
      "formulaId",
      "baselineSourceRevision",
      "baselineSemanticHash",
      "roleReceipt",
      "status",
      "priorLane",
    ]) &&
    commonRow(value) &&
    value.status === "prior-lane" &&
    (value.priorLane === "existing-system-c" ||
      value.priorLane === "parameter-binding")
  );
}

const HELD_REASONS = Object.freeze([
  "generalized-two-plane-held",
  "mutable-pixel-alias-held",
  "constant-role-not-proven",
  "constant-role-not-unique",
  "constant-role-outside-recurrence",
  "constant-definition-not-unique",
  "constant-initialization-control-not-proven",
  "constant-target-not-complex",
  "constant-target-written-after-initialization",
  "constant-target-used-by-bailout",
  "candidate-local-name-exhausted",
  "candidate-ir-invalid",
] as const);
function parseHeldRow(value: JsonRecord): boolean {
  return (
    exactKeys(value, [
      "formulaId",
      "baselineSourceRevision",
      "baselineSemanticHash",
      "roleReceipt",
      "status",
      "reasonCode",
    ]) &&
    commonRow(value) &&
    value.status === "held" &&
    typeof value.reasonCode === "string" &&
    HELD_REASONS.includes(
      value.reasonCode as JuliaPixelRecoveryCandidateHoldReasonV1,
    )
  );
}

function parseRewrite(value: unknown): boolean {
  if (
    !record(value) ||
    !exactKeys(value, [
      "kind",
      "constantTarget",
      "provenanceDepth",
      "recurrenceReadCount",
      "analyzerVersion",
    ]) ||
    (value.kind !== "direct-pixel-constant" &&
      value.kind !== "transitive-pixel-constant") ||
    !nonNegativeInteger(value.provenanceDepth) ||
    !positiveInteger(value.recurrenceReadCount) ||
    value.analyzerVersion !== JULIA_PIXEL_RECOVERY_CANDIDATE_ANALYZER_V1
  )
    return false;
  return value.kind === "direct-pixel-constant"
    ? value.constantTarget === null && value.provenanceDepth === 0
    : typeof value.constantTarget === "string" &&
        IDENTIFIER.test(value.constantTarget) &&
        (value.provenanceDepth === 1 || value.provenanceDepth === 2);
}
function parseCandidate(value: unknown): boolean {
  if (
    !record(value) ||
    !exactKeys(value, [
      "sourceRevision",
      "semanticHash",
      "definitionPath",
      "binding",
      "sourceAuthority",
      "activation",
    ]) ||
    typeof value.sourceRevision !== "string" ||
    !SHA256.test(value.sourceRevision) ||
    typeof value.semanticHash !== "string" ||
    !SHA256.test(value.semanticHash) ||
    value.definitionPath !==
      `${JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1}/${value.sourceRevision}.frm` ||
    !record(value.binding) ||
    !exactKeys(value.binding, ["kind", "sourceRevision"]) ||
    value.binding.kind !== "source-split" ||
    value.binding.sourceRevision !== value.sourceRevision ||
    value.sourceAuthority !== "isolated-content-addressed-draft" ||
    value.activation !== "inactive-candidate"
  )
    return false;
  return true;
}
function parseIdentity(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "formulaNamePreserved",
      "parameterSchemaPreserved",
      "terminationPreserved",
    ]) &&
    value.formulaNamePreserved === true &&
    value.parameterSchemaPreserved === true &&
    value.terminationPreserved === true
  );
}
function parseRights(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "rightsStatus",
      "publicationDecision",
      "implementationBasis",
      "leakageScanStatus",
    ]) &&
    typeof value.rightsStatus === "string" &&
    value.rightsStatus.length > 0 &&
    value.publicationDecision === "publish" &&
    typeof value.implementationBasis === "string" &&
    value.implementationBasis.length > 0 &&
    value.leakageScanStatus === "passed"
  );
}
function parseE0(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, [
      "evidenceClass",
      "parameterPlaneBitIdentical",
      "changedRegionAnalyzerRevision",
      "analysisContentHash",
      "coverageContentHash",
      "changedRegionCount",
      "reachableOrUnknownRegionCount",
      "coveredRegionCount",
      "uncoveredReachableOrUnknownRegionCount",
      "coverageBasis",
    ]) &&
    value.evidenceClass === "E0-parameter-plane-bit-identity" &&
    value.parameterPlaneBitIdentical === true &&
    typeof value.changedRegionAnalyzerRevision === "string" &&
    SHA256.test(value.changedRegionAnalyzerRevision) &&
    typeof value.analysisContentHash === "string" &&
    SHA256.test(value.analysisContentHash) &&
    typeof value.coverageContentHash === "string" &&
    SHA256.test(value.coverageContentHash) &&
    positiveInteger(value.changedRegionCount) &&
    positiveInteger(value.reachableOrUnknownRegionCount) &&
    value.reachableOrUnknownRegionCount <= value.changedRegionCount &&
    value.coveredRegionCount === value.changedRegionCount &&
    value.uncoveredReachableOrUnknownRegionCount === 0 &&
    value.coverageBasis === "static-role-plus-E0-parameter-identity"
  );
}
function parseCandidateRow(value: JsonRecord): boolean {
  return (
    exactKeys(value, [
      "formulaId",
      "baselineSourceRevision",
      "baselineSemanticHash",
      "roleReceipt",
      "status",
      "rewrite",
      "candidate",
      "identity",
      "rights",
      "e0",
      "authority",
    ]) &&
    commonRow(value) &&
    value.status === "candidate" &&
    parseRewrite(value.rewrite) &&
    parseCandidate(value.candidate) &&
    parseIdentity(value.identity) &&
    parseRights(value.rights) &&
    parseE0(value.e0) &&
    authority(value.authority)
  );
}
function parseRow(value: unknown): boolean {
  if (!record(value) || typeof value.status !== "string") return false;
  if (value.status === "prior-lane") return parsePriorRow(value);
  if (value.status === "held") return parseHeldRow(value);
  if (value.status === "candidate") return parseCandidateRow(value);
  return false;
}

function exactCountRecord(
  value: unknown,
  expected: Readonly<Record<string, number>>,
): boolean {
  return (
    record(value) &&
    exactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, count]) => value[key] === count)
  );
}
function parseSourceBindings(value: unknown): boolean {
  return (
    record(value) &&
    exactKeys(value, JULIA_PIXEL_RECOVERY_CANDIDATE_SOURCE_BINDING_PATHS_V1) &&
    Object.values(value).every(
      (digest) => typeof digest === "string" && SHA256.test(digest),
    )
  );
}

const EXPECTED_COUNTS = Object.freeze({
  priorLaneFormulaCount: 251,
  candidateFormulaCount: 159,
  heldFormulaCount: 124,
  candidateDefinitionCount: 159,
  stateSeparatedCandidateCount: 0,
  literalCandidateCount: 0,
  e1ReviewPackageCount: 0,
});
const EXPECTED_REWRITE_COUNTS = Object.freeze({
  directPixelConstant: 61,
  transitivePixelConstant: 98,
  transitiveDepthOne: 95,
  transitiveDepthTwo: 3,
});
const EXPECTED_HELD_COUNTS = Object.freeze({
  generalizedTwoPlane: 27,
  mutablePixelAlias: 30,
  constantRoleNotProven: 49,
  constantRoleOutsideRecurrence: 11,
  constantDefinitionNotUnique: 6,
  constantInitializationControlNotProven: 1,
});

function derivedCounts(rows: readonly JsonRecord[]): boolean {
  const prior = rows.filter((row) => row.status === "prior-lane");
  const candidates = rows.filter((row) => row.status === "candidate");
  const held = rows.filter((row) => row.status === "held");
  const direct = candidates.filter(
    (row) => (row.rewrite as JsonRecord).kind === "direct-pixel-constant",
  );
  const transitive = candidates.filter(
    (row) => (row.rewrite as JsonRecord).kind === "transitive-pixel-constant",
  );
  const heldCount = (reason: string) =>
    held.filter((row) => row.reasonCode === reason).length;
  return (
    prior.length === EXPECTED_COUNTS.priorLaneFormulaCount &&
    candidates.length === EXPECTED_COUNTS.candidateFormulaCount &&
    held.length === EXPECTED_COUNTS.heldFormulaCount &&
    new Set(
      candidates.map((row) => (row.candidate as JsonRecord).sourceRevision),
    ).size === EXPECTED_COUNTS.candidateDefinitionCount &&
    direct.length === EXPECTED_REWRITE_COUNTS.directPixelConstant &&
    transitive.length === EXPECTED_REWRITE_COUNTS.transitivePixelConstant &&
    transitive.filter(
      (row) => (row.rewrite as JsonRecord).provenanceDepth === 1,
    ).length === EXPECTED_REWRITE_COUNTS.transitiveDepthOne &&
    transitive.filter(
      (row) => (row.rewrite as JsonRecord).provenanceDepth === 2,
    ).length === EXPECTED_REWRITE_COUNTS.transitiveDepthTwo &&
    heldCount("generalized-two-plane-held") ===
      EXPECTED_HELD_COUNTS.generalizedTwoPlane &&
    heldCount("mutable-pixel-alias-held") ===
      EXPECTED_HELD_COUNTS.mutablePixelAlias &&
    heldCount("constant-role-not-proven") ===
      EXPECTED_HELD_COUNTS.constantRoleNotProven &&
    heldCount("constant-role-outside-recurrence") ===
      EXPECTED_HELD_COUNTS.constantRoleOutsideRecurrence &&
    heldCount("constant-definition-not-unique") ===
      EXPECTED_HELD_COUNTS.constantDefinitionNotUnique &&
    heldCount("constant-initialization-control-not-proven") ===
      EXPECTED_HELD_COUNTS.constantInitializationControlNotProven
  );
}

export function parseJuliaPixelRecoveryCandidatesV1(
  input: unknown,
): JuliaPixelRecoveryCandidatesParseResultV1 {
  try {
    if (
      !record(input) ||
      !exactKeys(input, [
        "schema",
        "revision",
        "stage",
        "authority",
        "activationStatus",
        "candidateSetState",
        "waveId",
        "candidateDefinitionsRoot",
        "runtimeIndexCanonicalSha256",
        "recoveryContractContentHash",
        "roleCensusContentHash",
        "parameterAuthorityContentHash",
        "sourceBindings",
        "rowCount",
        "counts",
        "rewriteCounts",
        "heldReasonCounts",
        "rows",
        "contentHash",
      ]) ||
      input.schema !== JULIA_PIXEL_RECOVERY_CANDIDATES_SCHEMA_V1 ||
      input.revision !== 1 ||
      input.stage !== "candidate-generation" ||
      !authority(input.authority) ||
      input.activationStatus !== "inactive-candidate-only" ||
      input.candidateSetState !== "draft-not-wave-frozen" ||
      input.waveId !== null ||
      input.candidateDefinitionsRoot !==
        JULIA_PIXEL_RECOVERY_CANDIDATE_DEFINITION_ROOT_V1 ||
      typeof input.runtimeIndexCanonicalSha256 !== "string" ||
      !SHA256.test(input.runtimeIndexCanonicalSha256) ||
      typeof input.recoveryContractContentHash !== "string" ||
      !SHA256.test(input.recoveryContractContentHash) ||
      typeof input.roleCensusContentHash !== "string" ||
      !SHA256.test(input.roleCensusContentHash) ||
      typeof input.parameterAuthorityContentHash !== "string" ||
      !SHA256.test(input.parameterAuthorityContentHash) ||
      !parseSourceBindings(input.sourceBindings) ||
      input.rowCount !== JULIA_PIXEL_RECOVERY_CANDIDATES_ROW_COUNT_V1 ||
      !exactCountRecord(input.counts, EXPECTED_COUNTS) ||
      !exactCountRecord(input.rewriteCounts, EXPECTED_REWRITE_COUNTS) ||
      !exactCountRecord(input.heldReasonCounts, EXPECTED_HELD_COUNTS) ||
      !Array.isArray(input.rows) ||
      !dense(input.rows) ||
      input.rows.length !== JULIA_PIXEL_RECOVERY_CANDIDATES_ROW_COUNT_V1 ||
      !input.rows.every(parseRow) ||
      typeof input.contentHash !== "string" ||
      !SHA256.test(input.contentHash)
    )
      return {
        ok: false,
        code: "julia-pixel-recovery-candidates-invalid",
      };
    const rows = input.rows as JsonRecord[];
    if (
      rows.some(
        (row, index) =>
          index > 0 &&
          (rows[index - 1]!.formulaId as string) >=
            (row.formulaId as string),
      ) ||
      !derivedCounts(rows)
    )
      return {
        ok: false,
        code: "julia-pixel-recovery-candidates-invalid",
      };
    const content = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "contentHash"),
    );
    if (
      input.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, 1_048_576))
    )
      return {
        ok: false,
        code: "julia-pixel-recovery-candidates-invalid",
      };
    return {
      ok: true,
      value: immutable(input) as unknown as JuliaPixelRecoveryCandidatesAssetV1,
    };
  } catch {
    return {
      ok: false,
      code: "julia-pixel-recovery-candidates-invalid",
    };
  }
}
