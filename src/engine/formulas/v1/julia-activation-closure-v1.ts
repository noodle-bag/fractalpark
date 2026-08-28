import { parseJuliaFinalCapabilityCensusV1 } from "./julia-final-capability";
import {
  JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  parseJuliaFinalRecoveryAuditV3,
  parseJuliaPixelActivationHandoffV3,
  parseJuliaPixelFinalAuthorityManifestV3,
  parseJuliaPixelFinalCapabilityCensusV4,
  verifyJuliaFinalRecoveryActivationHandoffV3,
} from "./julia-final-recovery-v4";
import {
  parseJuliaFinalRecoveryAuditV2,
  parseJuliaPixelFinalCapabilityCensusV3,
} from "./julia-final-recovery-v3";
import { parseJuliaMutableStateAdjudicationV1 } from "./julia-mutable-state-adjudication-v1";
import { parseJuliaPixelRecoveryContractV1 } from "./julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_ACTIVATION_CLOSURE_ACK_SCHEMA_V1 =
  "fractalpark-julia-pixel-maintainer-acknowledgment/v1" as const;
export const JULIA_ACTIVATION_CLOSURE_AUTHORITY_SCHEMA_V4 =
  "fractalpark-julia-pixel-final-authority-manifest/v4" as const;
export const JULIA_ACTIVATION_CLOSURE_HANDOFF_SCHEMA_V4 =
  "fractalpark-julia-pixel-activation-handoff/v4" as const;
export const JULIA_ACTIVATION_CLOSURE_APPROVED_AT_V1 =
  "2026-08-28T18:47:11+08:00" as const;
export const JULIA_ACTIVATION_CLOSURE_RESIDUAL_RESPONSE_V1 =
  "不弄了，跳过这11个" as const;
export const JULIA_ACTIVATION_CLOSURE_MAINTAINER_RESPONSE_V1 =
  "确认路线一，并启动 handoff closure" as const;
export const JULIA_ACTIVATION_CLOSURE_APPROVAL_STATEMENT_V1 =
  "接受 final v4 中 exact-11 residual 在 v0.4.19 保持 held/blocked；允许生成 activation-eligible handoff 供后续单独授权的 29h 使用；不改变 final census、不恢复 residual、不执行 29h 或任何外部发布动作。" as const;
export const JULIA_ACTIVATION_CLOSURE_TRUST_MODEL_V1 = Object.freeze({
  authorityRoot: "repository-governed-human-maintainer-decision",
  identityAssurance: "approval-observed-in-authenticated-project-session",
  cryptographicSignature: "not-provided-by-project-policy",
  threatBoundary:
    "detects stale or substituted receipt bytes; repository-maintainer compromise is out of scope",
} as const);
export const JULIA_ACTIVATION_CLOSURE_AI_DISCLOSURE_V1 =
  "This acknowledgment receipt and its machine closure were drafted with AI assistance by Ellie; the residual disposition, route selection, and permission to start this closure were explicitly approved by the human maintainer." as const;
export const JULIA_ACTIVATION_CLOSURE_CONSUMER_PREDICATE_V1 =
  "modeClass=classic-julia AND finalStatus=supported AND requiredReceipts=pass" as const;

export const JULIA_ACTIVATION_CLOSURE_ALLOWS_V1 = Object.freeze([
  "seal and commit/push the v0.4.19 acknowledgment closure within Draft PR #20",
  "make only the exact-195 supported classic rows activation-eligible for a separately authorized 29h",
] as const);
export const JULIA_ACTIVATION_CLOSURE_EXCLUSIONS_V1 = Object.freeze([
  "mutate the sealed final v4 census or any formula, source, profile, renderer, or evidence row",
  "promote or conceal any exact-11 residual row",
  "execute 29h or wire runtime/UI activation",
  "mark the pull request ready, merge, or auto-merge",
  "deploy or promote Production, run migrations, create a tag or Release, or submit IndexNow",
] as const);

export const JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1 = Object.freeze([
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "resources/formula-library/v1/julia-pixel-final-capability-census.v4.json",
  "resources/formula-library/v1/julia-pixel-final-authority-manifest.v3.json",
  "resources/formula-library/v1/julia-pixel-activation-handoff.v3.json",
  "resources/formula-library/v1/julia-pixel-final-recovery-audit.v3.json",
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/julia-pixel-maintainer-acknowledgment.v1.json",
  "scripts/build-julia-activation-closure-v1.ts",
  "scripts/verify-julia-activation-closure-v1.ts",
  "src/engine/formulas/v1/julia-activation-closure-v1.ts",
  "src/test/julia-activation-closure-v1.test.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/julia-final-capability.ts",
  "src/engine/formulas/v1/julia-final-recovery-v4.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
] as const);

type RecordValue = Record<string, unknown>;
type Result<T, Code extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: Code };

export interface JuliaAcceptedResidualRowV1 {
  readonly formulaId: string;
  readonly modeClass: "classic-julia" | "generalized-two-plane" | "undetermined";
  readonly finalStatus: "held" | "blocked";
  readonly remediationLane: "identity-review" | "renderer-diagnosis";
}

export interface JuliaMaintainerAcknowledgmentV1 {
  readonly schema: typeof JULIA_ACTIVATION_CLOSURE_ACK_SCHEMA_V1;
  readonly revision: 1;
  readonly authority: Readonly<{
    readonly authorityState: "sealed";
    readonly supersededBy: null;
    readonly withdrawnBy: null;
  }>;
  readonly status: "maintainer-approved";
  readonly approvedAt: typeof JULIA_ACTIVATION_CLOSURE_APPROVED_AT_V1;
  readonly actorId: "fractalpark-maintainer";
  readonly actorKind: "human-maintainer";
  readonly actorRole: "maintainer";
  readonly decision: "accept-v0.4.19-residual-boundary";
  readonly targetVersion: "0.4.19";
  readonly finalCensusContentHash: string;
  readonly predecessorAuthorityManifestContentHash: string;
  readonly predecessorHandoffContentHash: string;
  readonly predecessorAuditContentHash: string;
  readonly supportedClassicRowSetDigest: string;
  readonly supportedClassicRowCount: 195;
  readonly regressionSetDigest: string;
  readonly regressionCount: 11;
  readonly acceptedResidualRows: readonly JuliaAcceptedResidualRowV1[];
  readonly approvalStatement: typeof JULIA_ACTIVATION_CLOSURE_APPROVAL_STATEMENT_V1;
  readonly residualDispositionResponse:
    typeof JULIA_ACTIVATION_CLOSURE_RESIDUAL_RESPONSE_V1;
  readonly maintainerResponse: typeof JULIA_ACTIVATION_CLOSURE_MAINTAINER_RESPONSE_V1;
  readonly trustModel: typeof JULIA_ACTIVATION_CLOSURE_TRUST_MODEL_V1;
  readonly aiAssistanceDisclosure: typeof JULIA_ACTIVATION_CLOSURE_AI_DISCLOSURE_V1;
  readonly scope: Readonly<{
    readonly allows: typeof JULIA_ACTIVATION_CLOSURE_ALLOWS_V1;
    readonly doesNotAllow: typeof JULIA_ACTIVATION_CLOSURE_EXCLUSIONS_V1;
  }>;
  readonly contentHash: string;
}

export interface JuliaActivationClosureInputsV1 {
  readonly baseline: unknown;
  readonly predecessorCensus: unknown;
  readonly predecessorAudit: unknown;
  readonly contract: unknown;
  readonly adjudication: unknown;
  readonly census: unknown;
  readonly predecessorAuthority: unknown;
  readonly predecessorHandoff: unknown;
  readonly finalAudit: unknown;
  readonly acknowledgment: unknown;
  readonly successorAuthority: unknown;
  readonly successorHandoff: unknown;
  readonly predecessorSourceContents: unknown;
  readonly closureSourceContents: unknown;
}

const SHA = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function plain(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  const expected = [...keys].sort();
  return actual.length === keys.length &&
    actual.every((key) => typeof key === "string") &&
    (actual as string[]).sort().every((key, index) => key === expected[index]);
}
function hash(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}
function seal(value: unknown): boolean {
  return plain(value) && exact(value, [
    "authorityState", "supersededBy", "withdrawnBy",
  ]) && value.authorityState === "sealed" && value.supersededBy === null &&
    value.withdrawnBy === null;
}
function same(left: unknown, right: unknown, budget = 1_048_576): boolean {
  return canonicalJsonV1(left, budget) === canonicalJsonV1(right, budget);
}
function frozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen)) as T;
  if (plain(value)) return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, frozen(child)]),
  )) as T;
  return value;
}
function dense(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}
function sortedHashes(value: unknown, length: number): value is string[] {
  return Array.isArray(value) && value.length === length && dense(value) && value.every(
    (entry, index, values) => hash(entry) && (index === 0 || values[index - 1] < entry),
  );
}
function sourceBindings(value: unknown): value is RecordValue {
  return plain(value) && exact(value, JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1) &&
    Object.values(value).every(hash);
}
function residualRows(value: unknown): value is JuliaAcceptedResidualRowV1[] {
  if (!Array.isArray(value) || value.length !== 11 || !dense(value)) return false;
  const seen = new Set<string>();
  let previous = "";
  let generalized = 0;
  let undetermined = 0;
  let renderer = 0;
  for (const entry of value) {
    if (!plain(entry) || !exact(entry, [
      "formulaId", "modeClass", "finalStatus", "remediationLane",
    ]) || typeof entry.formulaId !== "string" || !UUID.test(entry.formulaId) ||
      seen.has(entry.formulaId) || (previous !== "" && previous >= entry.formulaId)) return false;
    seen.add(entry.formulaId);
    previous = entry.formulaId;
    if (entry.modeClass === "generalized-two-plane" && entry.finalStatus === "held" &&
      entry.remediationLane === "identity-review") generalized += 1;
    else if (entry.modeClass === "undetermined" && entry.finalStatus === "held" &&
      entry.remediationLane === "identity-review") undetermined += 1;
    else if (entry.modeClass === "classic-julia" && entry.finalStatus === "blocked" &&
      entry.remediationLane === "renderer-diagnosis") renderer += 1;
    else return false;
  }
  return generalized === 8 && undetermined === 1 && renderer === 2;
}

export function juliaActivationClosureContentHashV1(value: RecordValue): string {
  return sha256HexSyncV1(canonicalJsonV1(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "contentHash"),
    ),
    1_048_576,
  ));
}
function sealedAsset(
  value: unknown,
  schema: string,
  revision: number,
  keys: readonly string[],
): value is RecordValue {
  return plain(value) && exact(value, keys) && value.schema === schema &&
    value.revision === revision && seal(value.authority) && hash(value.contentHash) &&
    value.contentHash === juliaActivationClosureContentHashV1(value);
}

export function parseJuliaMaintainerAcknowledgmentV1(
  input: unknown,
): Result<Readonly<JuliaMaintainerAcknowledgmentV1>, "julia-activation-closure-ack-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_ACTIVATION_CLOSURE_ACK_SCHEMA_V1, 1, [
      "schema", "revision", "authority", "status", "approvedAt", "actorId",
      "actorKind", "actorRole", "decision", "targetVersion", "finalCensusContentHash",
      "predecessorAuthorityManifestContentHash", "predecessorHandoffContentHash",
      "predecessorAuditContentHash", "supportedClassicRowSetDigest",
      "supportedClassicRowCount", "regressionSetDigest", "regressionCount",
      "acceptedResidualRows", "approvalStatement", "residualDispositionResponse",
      "maintainerResponse", "trustModel", "aiAssistanceDisclosure", "scope", "contentHash",
    ]) || input.status !== "maintainer-approved" ||
      input.approvedAt !== JULIA_ACTIVATION_CLOSURE_APPROVED_AT_V1 ||
      input.actorId !== "fractalpark-maintainer" || input.actorKind !== "human-maintainer" ||
      input.actorRole !== "maintainer" ||
      input.decision !== "accept-v0.4.19-residual-boundary" ||
      input.targetVersion !== "0.4.19" || ![
        input.finalCensusContentHash,
        input.predecessorAuthorityManifestContentHash,
        input.predecessorHandoffContentHash,
        input.predecessorAuditContentHash,
        input.supportedClassicRowSetDigest,
        input.regressionSetDigest,
      ].every(hash) || input.supportedClassicRowCount !== 195 ||
      input.regressionCount !== 11 || !residualRows(input.acceptedResidualRows) ||
      input.approvalStatement !== JULIA_ACTIVATION_CLOSURE_APPROVAL_STATEMENT_V1 ||
      input.residualDispositionResponse !== JULIA_ACTIVATION_CLOSURE_RESIDUAL_RESPONSE_V1 ||
      input.maintainerResponse !== JULIA_ACTIVATION_CLOSURE_MAINTAINER_RESPONSE_V1 ||
      !same(input.trustModel, JULIA_ACTIVATION_CLOSURE_TRUST_MODEL_V1) ||
      input.aiAssistanceDisclosure !== JULIA_ACTIVATION_CLOSURE_AI_DISCLOSURE_V1 ||
      !plain(input.scope) || !exact(input.scope, ["allows", "doesNotAllow"]) ||
      !Array.isArray(input.scope.allows) || !dense(input.scope.allows) ||
      !Array.isArray(input.scope.doesNotAllow) || !dense(input.scope.doesNotAllow) ||
      !same(input.scope.allows, JULIA_ACTIVATION_CLOSURE_ALLOWS_V1) ||
      !same(input.scope.doesNotAllow, JULIA_ACTIVATION_CLOSURE_EXCLUSIONS_V1)) throw Error();
    return {
      ok: true,
      value: frozen(input as unknown as JuliaMaintainerAcknowledgmentV1),
    };
  } catch {
    return { ok: false, code: "julia-activation-closure-ack-invalid" };
  }
}

export function parseJuliaPixelFinalAuthorityManifestV4(
  input: unknown,
): Result<Readonly<RecordValue>, "julia-activation-closure-authority-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_ACTIVATION_CLOSURE_AUTHORITY_SCHEMA_V4, 4, [
      "schema", "revision", "authority", "finalCensusContentHash",
      "predecessorAuthorityManifestContentHash", "predecessorHandoffContentHash",
      "predecessorAuditContentHash", "maintainerAcknowledgmentReceiptContentHash",
      "inputAuthorityContentHashes", "sourceBindings", "contentHash",
    ]) || ![
      input.finalCensusContentHash,
      input.predecessorAuthorityManifestContentHash,
      input.predecessorHandoffContentHash,
      input.predecessorAuditContentHash,
      input.maintainerAcknowledgmentReceiptContentHash,
    ].every(hash) || !sortedHashes(input.inputAuthorityContentHashes, 5) ||
      !sourceBindings(input.sourceBindings)) throw Error();
    return { ok: true, value: frozen(input) };
  } catch {
    return { ok: false, code: "julia-activation-closure-authority-invalid" };
  }
}

export function parseJuliaPixelActivationHandoffV4(
  input: unknown,
): Result<Readonly<RecordValue>, "julia-activation-closure-handoff-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_ACTIVATION_CLOSURE_HANDOFF_SCHEMA_V4, 4, [
      "schema", "revision", "authority", "handoffState", "finalCensusContentHash",
      "finalCensusAuthorityState", "authorityManifestContentHash",
      "predecessorHandoffContentHash", "supportedClassicRowSetDigest",
      "supportedClassicRowCount", "regressionSetDigest", "regressionCount",
      "maintainerAcknowledgmentReceiptDigest", "consumerRowPredicate", "contentHash",
    ]) || input.handoffState !== "activation-eligible" ||
      input.finalCensusAuthorityState !== "sealed" || ![
        input.finalCensusContentHash,
        input.authorityManifestContentHash,
        input.predecessorHandoffContentHash,
        input.supportedClassicRowSetDigest,
        input.regressionSetDigest,
        input.maintainerAcknowledgmentReceiptDigest,
      ].every(hash) || input.supportedClassicRowCount !== 195 ||
      input.regressionCount !== 11 ||
      input.consumerRowPredicate !== JULIA_ACTIVATION_CLOSURE_CONSUMER_PREDICATE_V1) throw Error();
    return { ok: true, value: frozen(input) };
  } catch {
    return { ok: false, code: "julia-activation-closure-handoff-invalid" };
  }
}

export function verifyJuliaActivationClosureV1(
  inputs: JuliaActivationClosureInputsV1,
): Result<Readonly<RecordValue>, "julia-activation-closure-consumer-invalid"> {
  try {
    const baseline = parseJuliaFinalCapabilityCensusV1(inputs.baseline);
    const predecessorCensus = parseJuliaPixelFinalCapabilityCensusV3(inputs.predecessorCensus);
    const predecessorAudit = parseJuliaFinalRecoveryAuditV2(inputs.predecessorAudit);
    const contract = parseJuliaPixelRecoveryContractV1(inputs.contract);
    const adjudication = parseJuliaMutableStateAdjudicationV1(inputs.adjudication);
    const census = parseJuliaPixelFinalCapabilityCensusV4(inputs.census);
    const predecessorAuthority = parseJuliaPixelFinalAuthorityManifestV3(
      inputs.predecessorAuthority,
    );
    const predecessorHandoff = parseJuliaPixelActivationHandoffV3(inputs.predecessorHandoff);
    const finalAudit = parseJuliaFinalRecoveryAuditV3(inputs.finalAudit);
    const acknowledgment = parseJuliaMaintainerAcknowledgmentV1(inputs.acknowledgment);
    const successorAuthority = parseJuliaPixelFinalAuthorityManifestV4(
      inputs.successorAuthority,
    );
    const successorHandoff = parseJuliaPixelActivationHandoffV4(inputs.successorHandoff);
    if (!baseline.ok || !predecessorCensus.ok || !predecessorAudit.ok || !contract.ok ||
      !adjudication.ok || !census.ok || !predecessorAuthority.ok ||
      !predecessorHandoff.ok || !finalAudit.ok || !acknowledgment.ok ||
      !successorAuthority.ok || !successorHandoff.ok ||
      !plain(inputs.predecessorSourceContents) || !plain(inputs.closureSourceContents)) {
      throw Error();
    }
    const closureSourceContents = inputs.closureSourceContents as RecordValue;
    const predecessorResult = verifyJuliaFinalRecoveryActivationHandoffV3(
      inputs.predecessorHandoff,
      inputs.census,
      inputs.predecessorAuthority,
      inputs.finalAudit,
      inputs.baseline,
      inputs.predecessorCensus,
      inputs.contract,
      inputs.predecessorAudit,
      inputs.adjudication,
      inputs.predecessorSourceContents,
    );
    if (predecessorResult.code !== "julia-final-recovery-v4-review-pending") throw Error();
    if (!exact(closureSourceContents, JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1) ||
      JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1.some(
        (path) => typeof closureSourceContents[path] !== "string",
      )) throw Error();
    const expectedBindings = Object.fromEntries(
      JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1.map((path) => [
        path,
        sha256HexSyncV1(closureSourceContents[path] as string),
      ]),
    );
    const supported = census.value.rows.filter((row) =>
      row.modeClass === "classic-julia" && row.finalStatus === "supported"
    ).map((row) => row.formulaId).sort();
    const baselineSupported = baseline.value.rows.filter((row) => row.status === "supported")
      .map((row) => row.formulaId).sort();
    const regressions = baselineSupported.filter((id) => !supported.includes(id));
    const regressionSet = new Set(regressions);
    const acceptedResidualRows = census.value.rows.filter((row) =>
      regressionSet.has(row.formulaId)
    ).map((row) => ({
      formulaId: row.formulaId,
      modeClass: row.modeClass,
      finalStatus: row.finalStatus,
      remediationLane: row.remediationLane,
    }));
    const supportedDigest = sha256HexSyncV1(canonicalJsonV1(supported, 16_384));
    const regressionDigest = sha256HexSyncV1(canonicalJsonV1(regressions, 4096));
    const authorityInputs = [
      contract.value.contentHash,
      predecessorAuthority.value.contentHash,
      predecessorHandoff.value.contentHash,
      finalAudit.value.contentHash,
      acknowledgment.value.contentHash,
    ].sort();
    if (supported.length !== 195 || regressions.length !== 11 ||
      !same(finalAudit.value.supportedClassicIds, supported) ||
      !same(finalAudit.value.regressionIds, regressions) ||
      acknowledgment.value.finalCensusContentHash !== census.value.contentHash ||
      acknowledgment.value.predecessorAuthorityManifestContentHash !==
        predecessorAuthority.value.contentHash ||
      acknowledgment.value.predecessorHandoffContentHash !== predecessorHandoff.value.contentHash ||
      acknowledgment.value.predecessorAuditContentHash !== finalAudit.value.contentHash ||
      acknowledgment.value.supportedClassicRowSetDigest !== supportedDigest ||
      acknowledgment.value.regressionSetDigest !== regressionDigest ||
      !same(acknowledgment.value.acceptedResidualRows, acceptedResidualRows) ||
      successorAuthority.value.finalCensusContentHash !== census.value.contentHash ||
      successorAuthority.value.predecessorAuthorityManifestContentHash !==
        predecessorAuthority.value.contentHash ||
      successorAuthority.value.predecessorHandoffContentHash !==
        predecessorHandoff.value.contentHash ||
      successorAuthority.value.predecessorAuditContentHash !== finalAudit.value.contentHash ||
      successorAuthority.value.maintainerAcknowledgmentReceiptContentHash !==
        acknowledgment.value.contentHash ||
      !same(successorAuthority.value.inputAuthorityContentHashes, authorityInputs) ||
      !same(successorAuthority.value.sourceBindings, expectedBindings) ||
      successorHandoff.value.finalCensusContentHash !== census.value.contentHash ||
      successorHandoff.value.authorityManifestContentHash !==
        successorAuthority.value.contentHash ||
      successorHandoff.value.predecessorHandoffContentHash !==
        predecessorHandoff.value.contentHash ||
      successorHandoff.value.supportedClassicRowSetDigest !== supportedDigest ||
      successorHandoff.value.regressionSetDigest !== regressionDigest ||
      successorHandoff.value.maintainerAcknowledgmentReceiptDigest !==
        acknowledgment.value.contentHash) throw Error();
    return {
      ok: true,
      value: frozen({
        handoffState: "activation-eligible",
        finalCensusContentHash: census.value.contentHash,
        supportedClassicRowSetDigest: supportedDigest,
        supportedClassicRowCount: supported.length,
        regressionSetDigest: regressionDigest,
        regressionCount: regressions.length,
        maintainerAcknowledgmentReceiptDigest: acknowledgment.value.contentHash,
      }),
    };
  } catch {
    return { ok: false, code: "julia-activation-closure-consumer-invalid" };
  }
}

export { JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS };
