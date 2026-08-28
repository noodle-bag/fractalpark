import { parseJuliaFinalCapabilityCensusV1 } from "./julia-final-capability";
import {
  parseJuliaFinalRecoveryAuditV2,
  parseJuliaPixelFinalCapabilityCensusV3,
} from "./julia-final-recovery-v3";
import { parseJuliaMutableStateAdjudicationV1 } from "./julia-mutable-state-adjudication-v1";
import {
  parseJuliaPixelRecoveryContractV1,
  parseJuliaPixelRecoveryProjectionRowV1,
  type JuliaPixelRecoveryProjectionRowV1,
} from "./julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_FINAL_RECOVERY_V4_CENSUS_SCHEMA =
  "fractalpark-julia-pixel-final-capability-census/v4" as const;
export const JULIA_FINAL_RECOVERY_V4_AUTHORITY_SCHEMA =
  "fractalpark-julia-pixel-final-authority-manifest/v3" as const;
export const JULIA_FINAL_RECOVERY_V4_HANDOFF_SCHEMA =
  "fractalpark-julia-pixel-activation-handoff/v3" as const;
export const JULIA_FINAL_RECOVERY_V4_AUDIT_SCHEMA =
  "fractalpark-julia-pixel-final-recovery-audit/v3" as const;

/* Output assets are deliberately omitted because their hashes would be recursive. */
export const JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS = Object.freeze([
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "resources/formula-library/v1/julia-pixel-final-capability-census.v3.json",
  "resources/formula-library/v1/julia-pixel-final-recovery-audit.v2.json",
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/julia-mutable-state-adjudication.v1.json",
  "scripts/build-julia-final-recovery-v4.ts",
  "scripts/verify-julia-final-recovery-v4.ts",
  "src/engine/formulas/v1/julia-final-recovery-v4.ts",
  "src/test/julia-final-recovery-v4.test.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/julia-final-capability.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/julia-final-recovery-v3.ts",
  "src/engine/formulas/v1/julia-mutable-state-adjudication-v1.ts",
] as const);

type RecordValue = Record<string, unknown>;
type Result<T, Code extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: Code };
export interface JuliaFinalRecoveryCensusV4 {
  readonly schema: typeof JULIA_FINAL_RECOVERY_V4_CENSUS_SCHEMA;
  readonly revision: 4;
  readonly authority: Readonly<{
    readonly authorityState: "sealed";
    readonly supersededBy: null;
    readonly withdrawnBy: null;
  }>;
  readonly contractContentHash: string;
  readonly predecessorContentHash: string;
  readonly adjudicationContentHash: string;
  readonly rowCount: 534;
  readonly rows: readonly JuliaPixelRecoveryProjectionRowV1[];
  readonly contentHash: string;
}
const SHA = /^[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ROWS = 534;
const ROLE_ORDER = [
  "role:pixel-seed",
  "role:pixel-constant",
  "role:julia-constant",
  "role:derived-pixel-constant",
  "role:formula-parameter",
  "role:dynamic-orbit-state",
  "role:bailout-control",
  "role:unresolved",
] as const;

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
function dense(value: unknown, length: number): value is unknown[] {
  return Array.isArray(value) && value.length === length &&
    Array.from({ length }, (_, index) =>
      Object.prototype.hasOwnProperty.call(value, index),
    ).every(Boolean);
}
function hash(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}
function ids(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id, index, values) =>
    typeof id === "string" && UUID.test(id) &&
    (index === 0 || values[index - 1] < id),
  );
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
function seal(value: unknown): boolean {
  return plain(value) && exact(value, [
    "authorityState", "supersededBy", "withdrawnBy",
  ]) && value.authorityState === "sealed" && value.supersededBy === null &&
    value.withdrawnBy === null;
}
export function juliaFinalRecoveryV4ContentHash(value: RecordValue): string {
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
    value.contentHash === juliaFinalRecoveryV4ContentHash(value);
}
function bindings(value: unknown): value is RecordValue {
  return plain(value) && exact(value, JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS) &&
    Object.values(value).every(hash);
}
function partition(value: RecordValue): boolean {
  const lists = [
    value.supportedClassicIds,
    value.heldIds,
    value.blockedIds,
    value.unknownIds,
    value.notApplicableIds,
  ];
  const labels = ["supported", "held", "blocked", "unknown", "notApplicable"];
  return lists.every(ids) && lists.flat().length === ROWS &&
    new Set(lists.flat()).size === ROWS && plain(value.statusCounts) &&
    exact(value.statusCounts, labels) && lists.every((list, index) =>
      (value.statusCounts as RecordValue)[labels[index]!] === list.length,
    );
}

export function parseJuliaPixelFinalCapabilityCensusV4(
  input: unknown,
): Result<Readonly<JuliaFinalRecoveryCensusV4>, "julia-final-recovery-v4-census-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V4_CENSUS_SCHEMA, 4, [
      "schema", "revision", "authority", "contractContentHash",
      "predecessorContentHash", "adjudicationContentHash", "rowCount", "rows",
      "contentHash",
    ]) || ![
      input.contractContentHash,
      input.predecessorContentHash,
      input.adjudicationContentHash,
    ].every(hash) || input.rowCount !== ROWS || !dense(input.rows, ROWS)) throw Error();
    const seen = new Set<string>();
    let previous = "";
    for (const row of input.rows) {
      const parsed = parseJuliaPixelRecoveryProjectionRowV1(row);
      if (!parsed.ok || seen.has(parsed.value.formulaId) ||
        (previous !== "" && previous >= parsed.value.formulaId)) throw Error();
      seen.add(parsed.value.formulaId);
      previous = parsed.value.formulaId;
    }
    return {
      ok: true,
      value: frozen(input as unknown as JuliaFinalRecoveryCensusV4),
    };
  } catch {
    return { ok: false, code: "julia-final-recovery-v4-census-invalid" };
  }
}

export function parseJuliaPixelFinalAuthorityManifestV3(
  input: unknown,
): Result<Readonly<RecordValue>, "julia-final-recovery-v4-authority-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V4_AUTHORITY_SCHEMA, 3, [
      "schema", "revision", "authority", "finalCensusContentHash",
      "inputAuthorityContentHashes", "sourceBindings", "contentHash",
    ]) || !hash(input.finalCensusContentHash) ||
      !Array.isArray(input.inputAuthorityContentHashes) ||
      input.inputAuthorityContentHashes.length !== 5 ||
      !input.inputAuthorityContentHashes.every((entry, index, values) =>
        hash(entry) && (index === 0 || values[index - 1] < entry),
      ) || !bindings(input.sourceBindings)) throw Error();
    return { ok: true, value: frozen(input) };
  } catch {
    return { ok: false, code: "julia-final-recovery-v4-authority-invalid" };
  }
}

export function parseJuliaPixelActivationHandoffV3(
  input: unknown,
): Result<Readonly<RecordValue>, "julia-final-recovery-v4-handoff-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V4_HANDOFF_SCHEMA, 3, [
      "schema", "revision", "authority", "handoffState", "finalCensusContentHash",
      "authorityManifestContentHash", "supportedClassicRowSetDigest",
      "supportedClassicRowCount", "regressionSetDigest", "regressionCount",
      "maintainerAcknowledgmentReceiptDigest", "contentHash",
    ]) || input.handoffState !== "review-pending" ||
      input.maintainerAcknowledgmentReceiptDigest !== null || ![
        input.finalCensusContentHash,
        input.authorityManifestContentHash,
        input.supportedClassicRowSetDigest,
        input.regressionSetDigest,
      ].every(hash) || input.supportedClassicRowCount !== 195 ||
      input.regressionCount !== 11) throw Error();
    return { ok: true, value: frozen(input) };
  } catch {
    return { ok: false, code: "julia-final-recovery-v4-handoff-invalid" };
  }
}

export function parseJuliaFinalRecoveryAuditV3(
  input: unknown,
): Result<Readonly<RecordValue>, "julia-final-recovery-v4-audit-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V4_AUDIT_SCHEMA, 3, [
      "schema", "revision", "authority", "baselineContentHash",
      "predecessorContentHash", "predecessorAuditContentHash",
      "contractContentHash", "adjudicationContentHash", "finalCensusContentHash",
      "authorityManifestContentHash", "activationHandoffContentHash", "statusCounts",
      "supportedClassicIds", "heldIds", "blockedIds", "unknownIds",
      "notApplicableIds", "gainIds", "regressionIds", "recoveredRegressionIds",
      "cumulativeRecoveredRegressionIds", "sourceBindings", "contentHash",
    ]) || ![
      input.baselineContentHash,
      input.predecessorContentHash,
      input.predecessorAuditContentHash,
      input.contractContentHash,
      input.adjudicationContentHash,
      input.finalCensusContentHash,
      input.authorityManifestContentHash,
      input.activationHandoffContentHash,
    ].every(hash) || !partition(input) || !plain(input.statusCounts) ||
      input.statusCounts.supported !== 195 || input.statusCounts.held !== 151 ||
      input.statusCounts.blocked !== 72 || input.statusCounts.unknown !== 116 ||
      input.statusCounts.notApplicable !== 0 || !ids(input.gainIds) ||
      !ids(input.regressionIds) || !ids(input.recoveredRegressionIds) ||
      !ids(input.cumulativeRecoveredRegressionIds) || !ids(input.supportedClassicIds) ||
      input.gainIds.length !== 36 || input.regressionIds.length !== 11 ||
      input.recoveredRegressionIds.length !== 9 ||
      input.cumulativeRecoveredRegressionIds.length !== 16 ||
      input.gainIds.some((id) => !(input.supportedClassicIds as string[]).includes(id)) ||
      input.recoveredRegressionIds.some(
        (id) => !(input.supportedClassicIds as string[]).includes(id),
      ) || input.cumulativeRecoveredRegressionIds.some(
        (id) => !(input.supportedClassicIds as string[]).includes(id),
      ) || !bindings(input.sourceBindings)) throw Error();
    return { ok: true, value: frozen(input) };
  } catch {
    return { ok: false, code: "julia-final-recovery-v4-audit-invalid" };
  }
}

/** Validates the complete sealed exact-9 closure; activation remains review-pending. */
export function verifyJuliaFinalRecoveryActivationHandoffV3(
  handoffValue: unknown,
  censusValue: unknown,
  authorityValue: unknown,
  auditValue: unknown,
  baselineValue: unknown,
  predecessorValue: unknown,
  contractValue: unknown,
  predecessorAuditValue: unknown,
  adjudicationValue: unknown,
  currentSourceContentsValue: unknown,
): {
  readonly ok: false;
  readonly code:
    | "julia-final-recovery-v4-consumer-invalid"
    | "julia-final-recovery-v4-review-pending";
} {
  const handoff = parseJuliaPixelActivationHandoffV3(handoffValue);
  const census = parseJuliaPixelFinalCapabilityCensusV4(censusValue);
  const authority = parseJuliaPixelFinalAuthorityManifestV3(authorityValue);
  const audit = parseJuliaFinalRecoveryAuditV3(auditValue);
  const baseline = parseJuliaFinalCapabilityCensusV1(baselineValue);
  const predecessor = parseJuliaPixelFinalCapabilityCensusV3(predecessorValue);
  const contract = parseJuliaPixelRecoveryContractV1(contractValue);
  const predecessorAudit = parseJuliaFinalRecoveryAuditV2(predecessorAuditValue);
  const adjudication = parseJuliaMutableStateAdjudicationV1(adjudicationValue);
  if (!handoff.ok || !census.ok || !authority.ok || !audit.ok || !baseline.ok ||
    !predecessor.ok || !contract.ok || !predecessorAudit.ok || !adjudication.ok ||
    !plain(currentSourceContentsValue)) {
    return { ok: false, code: "julia-final-recovery-v4-consumer-invalid" };
  }
  const paths = JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS;
  if (!exact(currentSourceContentsValue, paths) || paths.some(
    (path) => typeof currentSourceContentsValue[path] !== "string",
  )) return { ok: false, code: "julia-final-recovery-v4-consumer-invalid" };
  const expectedBindings = Object.fromEntries(paths.map((path) => [
    path,
    sha256HexSyncV1(currentSourceContentsValue[path] as string),
  ]));
  const predecessors = predecessor.value.rows;
  const adjudications = new Map(
    adjudication.value.rows.map((row) => [row.formulaId, row]),
  );
  const eligible = predecessors.filter((row) =>
    row.modeClass === "undetermined" && row.finalStatus === "held" &&
    row.supportLane === "none" && row.remediationLane === "mutable-state-separation",
  ).map((row) => row.formulaId).sort();
  const adjudicationIds = adjudication.value.rows.map((row) => row.formulaId).sort();
  const predecessorRegressions = [
    ...(predecessorAudit.value.regressionIds as string[]),
  ];
  const targets = eligible.filter((id) =>
    adjudications.has(id) && predecessorRegressions.includes(id),
  );
  if (!same(targets, adjudicationIds) || targets.length !== 9 ||
    !same(census.value.rows.map((row) => row.formulaId),
      predecessors.map((row) => row.formulaId))) {
    return { ok: false, code: "julia-final-recovery-v4-consumer-invalid" };
  }
  const targetSet = new Set(targets);
  for (let index = 0; index < ROWS; index += 1) {
    const old = predecessors[index]!;
    const row = census.value.rows[index]!;
    if (!targetSet.has(old.formulaId)) {
      if (!same(row, old)) {
        return { ok: false, code: "julia-final-recovery-v4-consumer-invalid" };
      }
      continue;
    }
    const correction = adjudications.get(old.formulaId)!;
    const roles = old.roles
      .filter((role) => role !== "role:unresolved")
      .sort((left, right) => ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right));
    const expected = {
      ...old,
      roles,
      modeClass: "classic-julia",
      supportLane: "state-separated",
      remediationLane: "none",
      rewriteClass: "E0-operational-equivalence",
      finalStatus: "supported",
      identityChangeProposalRef: null,
      evidence: {
        tier0: "pass",
        tier1: "pass",
        tier2: "pass",
        identityReview: "not-required",
        e1Supplement: "not-required",
        e1SealedHoldout: "not-required",
        notApplicableReview: "not-required",
      },
      receipts: {
        ...old.receipts,
        sourceAuthority: `sha256:${correction.candidateSourceRevision}`,
        roleDiscovery: `sha256:${correction.rowReceipt}`,
        directPixelSeed: `sha256:${correction.rowReceipt}`,
        tier0: `sha256:${correction.rowReceipt}`,
        tier1: `sha256:${correction.rowReceipt}`,
        tier2: `sha256:${correction.rendererTupleReceipt}`,
        identityReview: null,
        e1Supplement: null,
        e1SealedHoldout: null,
        notApplicableReview: null,
      },
      authority: {
        authorityState: "sealed",
        supersededBy: null,
        withdrawnBy: null,
      },
    };
    if (!same(row, expected)) {
      return { ok: false, code: "julia-final-recovery-v4-consumer-invalid" };
    }
  }
  const status = (name: string) => census.value.rows
    .filter((row) => row.finalStatus === name)
    .map((row) => row.formulaId)
    .sort();
  const supported = status("supported");
  const held = status("held");
  const blocked = status("blocked");
  const unknown = status("unknown");
  const notApplicable = status("not-applicable");
  const baselineSupported = baseline.value.rows
    .filter((row) => row.status === "supported")
    .map((row) => row.formulaId)
    .sort();
  const gains = supported.filter((id) => !baselineSupported.includes(id));
  const regressions = baselineSupported.filter((id) => !supported.includes(id));
  const cumulativeRecovered = [...new Set([
    ...(predecessorAudit.value.recoveredRegressionIds as string[]),
    ...targets,
  ])].sort();
  const authorityInputs = [
    baseline.value.contentHash,
    predecessor.value.contentHash,
    predecessorAudit.value.contentHash,
    contract.value.contentHash,
    adjudication.value.contentHash,
  ].sort();
  if (!same(authority.value.sourceBindings, expectedBindings) ||
    !same(audit.value.sourceBindings, expectedBindings) ||
    authority.value.finalCensusContentHash !== census.value.contentHash ||
    !same(authority.value.inputAuthorityContentHashes, authorityInputs) ||
    handoff.value.finalCensusContentHash !== census.value.contentHash ||
    handoff.value.authorityManifestContentHash !== authority.value.contentHash ||
    handoff.value.supportedClassicRowCount !== supported.length ||
    handoff.value.regressionCount !== regressions.length ||
    handoff.value.supportedClassicRowSetDigest !== sha256HexSyncV1(
      canonicalJsonV1(supported, 16_384),
    ) || handoff.value.regressionSetDigest !== sha256HexSyncV1(
      canonicalJsonV1(regressions, 4096),
    ) || audit.value.baselineContentHash !== baseline.value.contentHash ||
    audit.value.predecessorContentHash !== predecessor.value.contentHash ||
    audit.value.predecessorAuditContentHash !== predecessorAudit.value.contentHash ||
    audit.value.contractContentHash !== contract.value.contentHash ||
    audit.value.adjudicationContentHash !== adjudication.value.contentHash ||
    audit.value.finalCensusContentHash !== census.value.contentHash ||
    audit.value.authorityManifestContentHash !== authority.value.contentHash ||
    audit.value.activationHandoffContentHash !== handoff.value.contentHash ||
    !same(audit.value.supportedClassicIds, supported) ||
    !same(audit.value.heldIds, held) || !same(audit.value.blockedIds, blocked) ||
    !same(audit.value.unknownIds, unknown) ||
    !same(audit.value.notApplicableIds, notApplicable) ||
    !same(audit.value.gainIds, gains) ||
    !same(audit.value.regressionIds, regressions) ||
    !same(audit.value.recoveredRegressionIds, targets) ||
    !same(audit.value.cumulativeRecoveredRegressionIds, cumulativeRecovered)) {
    return { ok: false, code: "julia-final-recovery-v4-consumer-invalid" };
  }
  return { ok: false, code: "julia-final-recovery-v4-review-pending" };
}
