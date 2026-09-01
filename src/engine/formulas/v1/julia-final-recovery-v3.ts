import { parseJuliaFinalCapabilityCensusV1 } from "./julia-final-capability";
import { parseJuliaFinalRecoveryAuditV1 } from "./julia-final-recovery-v2";
import { parseJuliaClassicRegressionCorrectiveV1 } from "./julia-classic-regression-corrective-v1";
import { parseJuliaClassicRegressionRendererEvidenceV1 } from "./julia-classic-regression-renderer-closure-v1";
import {
  parseJuliaPixelFinalCapabilityCensusV2,
  parseJuliaPixelRecoveryContractV1,
  parseJuliaPixelRecoveryProjectionRowV1,
  type JuliaPixelRecoveryProjectionRowV1,
} from "./julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_FINAL_RECOVERY_V3_CENSUS_SCHEMA = "fractalpark-julia-pixel-final-capability-census/v3" as const;
export const JULIA_FINAL_RECOVERY_V3_AUTHORITY_SCHEMA = "fractalpark-julia-pixel-final-authority-manifest/v2" as const;
export const JULIA_FINAL_RECOVERY_V3_HANDOFF_SCHEMA = "fractalpark-julia-pixel-activation-handoff/v2" as const;
export const JULIA_FINAL_RECOVERY_V3_AUDIT_SCHEMA = "fractalpark-julia-pixel-final-recovery-audit/v2" as const;

/* Output assets deliberately are not bindings: that would make their hashes recursive. */
export const JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS = Object.freeze([
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "resources/formula-library/v1/julia-pixel-final-capability-census.v2.json",
  "resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
  "resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json",
  "scripts/build-julia-final-recovery-v3.ts",
  "scripts/verify-julia-final-recovery-v3.ts",
  "src/engine/formulas/v1/julia-final-recovery-v3.ts",
  "src/test/julia-final-recovery-v3.test.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/julia-final-capability.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/julia-final-recovery-v2.ts",
  "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
  "src/engine/formulas/v1/julia-classic-regression-renderer-closure-v1.ts",
] as const);

type RecordValue = Record<string, unknown>;
type Result<T, Code extends string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: Code };
export interface JuliaFinalRecoveryCensusV3 {
  readonly schema: typeof JULIA_FINAL_RECOVERY_V3_CENSUS_SCHEMA;
  readonly revision: 3;
  readonly authority: Readonly<{
    readonly authorityState: "sealed";
    readonly supersededBy: null;
    readonly withdrawnBy: null;
  }>;
  readonly contractContentHash: string;
  readonly predecessorContentHash: string;
  readonly correctiveContentHash: string;
  readonly rendererEvidenceContentHash: string;
  readonly rowCount: 534;
  readonly rows: readonly JuliaPixelRecoveryProjectionRowV1[];
  readonly contentHash: string;
}
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const ROWS = 534;
const seal = (value: unknown): boolean => plain(value) && exact(value, ["authorityState", "supersededBy", "withdrawnBy"]) && value.authorityState === "sealed" && value.supersededBy === null && value.withdrawnBy === null;

function plain(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length && actual.every((key) => typeof key === "string") && [...actual].sort().every((key, index) => key === [...keys].sort()[index]);
}
function dense(value: unknown, length: number): value is unknown[] {
  return Array.isArray(value) && value.length === length && Array.from({ length }, (_, index) => Object.prototype.hasOwnProperty.call(value, index)).every(Boolean);
}
function hash(value: unknown): value is string { return typeof value === "string" && SHA.test(value); }
function ids(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id, index, values) => typeof id === "string" && UUID.test(id) && (index === 0 || values[index - 1] < id));
}
function same(left: unknown, right: unknown, budget = 1_048_576): boolean { return canonicalJsonV1(left, budget) === canonicalJsonV1(right, budget); }
function frozen<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(frozen)) as T;
  if (plain(value)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, frozen(child)]))) as T;
  return value;
}
export function juliaFinalRecoveryV3ContentHash(value: RecordValue): string {
  return sha256HexSyncV1(canonicalJsonV1(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "contentHash")), 1_048_576));
}
function sealedAsset(value: unknown, schema: string, revision: number, keys: readonly string[]): value is RecordValue {
  return plain(value) && exact(value, keys) && value.schema === schema && value.revision === revision && seal(value.authority) && hash(value.contentHash) && value.contentHash === juliaFinalRecoveryV3ContentHash(value);
}
function bindings(value: unknown): value is RecordValue {
  return plain(value) && exact(value, JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS) && Object.values(value).every(hash);
}
function partition(value: RecordValue): boolean {
  const lists = [value.supportedClassicIds, value.heldIds, value.blockedIds, value.unknownIds, value.notApplicableIds];
  return lists.every(ids) && lists.flat().length === ROWS && new Set(lists.flat()).size === ROWS && value.statusCounts !== null && plain(value.statusCounts) && exact(value.statusCounts, ["supported", "held", "blocked", "unknown", "notApplicable"]) && lists.every((list, i) => (value.statusCounts as RecordValue)[["supported", "held", "blocked", "unknown", "notApplicable"][i]!] === list.length);
}

export function parseJuliaPixelFinalCapabilityCensusV3(input: unknown): Result<Readonly<JuliaFinalRecoveryCensusV3>, "julia-final-recovery-v3-census-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V3_CENSUS_SCHEMA, 3, ["schema", "revision", "authority", "contractContentHash", "predecessorContentHash", "correctiveContentHash", "rendererEvidenceContentHash", "rowCount", "rows", "contentHash"]) || ![input.contractContentHash, input.predecessorContentHash, input.correctiveContentHash, input.rendererEvidenceContentHash].every(hash) || input.rowCount !== ROWS || !dense(input.rows, ROWS)) throw Error();
    const seen = new Set<string>();
    let previousFormulaId = "";
    for (const row of input.rows) {
      const parsed = parseJuliaPixelRecoveryProjectionRowV1(row);
      if (
        !parsed.ok ||
        seen.has(parsed.value.formulaId) ||
        (previousFormulaId !== "" &&
          previousFormulaId >= parsed.value.formulaId)
      )
        throw Error();
      seen.add(parsed.value.formulaId);
      previousFormulaId = parsed.value.formulaId;
    }
    return {
      ok: true,
      value: frozen(input as unknown as JuliaFinalRecoveryCensusV3),
    };
  } catch { return { ok: false, code: "julia-final-recovery-v3-census-invalid" }; }
}
export function parseJuliaPixelFinalAuthorityManifestV2(input: unknown): Result<Readonly<RecordValue>, "julia-final-recovery-v3-authority-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V3_AUTHORITY_SCHEMA, 2, ["schema", "revision", "authority", "finalCensusContentHash", "inputAuthorityContentHashes", "sourceBindings", "contentHash"]) || !hash(input.finalCensusContentHash) || !Array.isArray(input.inputAuthorityContentHashes) || input.inputAuthorityContentHashes.length !== 5 || !input.inputAuthorityContentHashes.every((entry, index, values) => hash(entry) && (index === 0 || values[index - 1] < entry)) || !bindings(input.sourceBindings)) throw Error();
    return { ok: true, value: frozen(input) };
  } catch { return { ok: false, code: "julia-final-recovery-v3-authority-invalid" }; }
}
export function parseJuliaPixelActivationHandoffV2(input: unknown): Result<Readonly<RecordValue>, "julia-final-recovery-v3-handoff-invalid"> {
  try {
    if (!sealedAsset(input, JULIA_FINAL_RECOVERY_V3_HANDOFF_SCHEMA, 2, ["schema", "revision", "authority", "handoffState", "finalCensusContentHash", "authorityManifestContentHash", "supportedClassicRowSetDigest", "supportedClassicRowCount", "regressionSetDigest", "regressionCount", "maintainerAcknowledgmentReceiptDigest", "contentHash"]) || input.handoffState !== "review-pending" || input.maintainerAcknowledgmentReceiptDigest !== null || ![input.finalCensusContentHash, input.authorityManifestContentHash, input.supportedClassicRowSetDigest, input.regressionSetDigest].every(hash) || input.supportedClassicRowCount !== 186 || input.regressionCount !== 20) throw Error();
    return { ok: true, value: frozen(input) };
  } catch { return { ok: false, code: "julia-final-recovery-v3-handoff-invalid" }; }
}
export function parseJuliaFinalRecoveryAuditV2(input: unknown): Result<Readonly<RecordValue>, "julia-final-recovery-v3-audit-invalid"> {
  try {
    if (
      !sealedAsset(input, JULIA_FINAL_RECOVERY_V3_AUDIT_SCHEMA, 2, [
        "schema",
        "revision",
        "authority",
        "baselineContentHash",
        "predecessorContentHash",
        "contractContentHash",
        "correctiveContentHash",
        "rendererEvidenceContentHash",
        "finalCensusContentHash",
        "authorityManifestContentHash",
        "activationHandoffContentHash",
        "statusCounts",
        "supportedClassicIds",
        "heldIds",
        "blockedIds",
        "unknownIds",
        "notApplicableIds",
        "gainIds",
        "regressionIds",
        "recoveredRegressionIds",
        "sourceBindings",
        "contentHash",
      ]) ||
      ![
        input.baselineContentHash,
        input.predecessorContentHash,
        input.contractContentHash,
        input.correctiveContentHash,
        input.rendererEvidenceContentHash,
        input.finalCensusContentHash,
        input.authorityManifestContentHash,
        input.activationHandoffContentHash,
      ].every(hash) ||
      !partition(input)
    )
      throw Error();
    const statusCounts = input.statusCounts;
    const gainIds = input.gainIds;
    const regressionIds = input.regressionIds;
    const recoveredRegressionIds = input.recoveredRegressionIds;
    const supportedClassicIds = input.supportedClassicIds;
    if (
      !plain(statusCounts) ||
      statusCounts.supported !== 186 ||
      statusCounts.held !== 160 ||
      statusCounts.blocked !== 72 ||
      statusCounts.unknown !== 116 ||
      statusCounts.notApplicable !== 0 ||
      !ids(gainIds) ||
      !ids(regressionIds) ||
      !ids(recoveredRegressionIds) ||
      !ids(supportedClassicIds) ||
      gainIds.length !== 36 ||
      regressionIds.length !== 20 ||
      recoveredRegressionIds.length !== 7 ||
      gainIds.some((id) => !supportedClassicIds.includes(id)) ||
      recoveredRegressionIds.some((id) => !supportedClassicIds.includes(id)) ||
      !bindings(input.sourceBindings)
    )
      throw Error();
    return { ok: true, value: frozen(input) };
  } catch {
    return { ok: false, code: "julia-final-recovery-v3-audit-invalid" };
  }
}

/** Validates the complete sealed 7E-I closure; review remains explicitly pending. */
export function verifyJuliaFinalRecoveryActivationHandoffV2(
  handoffValue: unknown, censusValue: unknown, authorityValue: unknown, auditValue: unknown,
  baselineValue: unknown, predecessorValue: unknown, contractValue: unknown, predecessorAuditValue: unknown,
  correctiveValue: unknown, rendererValue: unknown, currentSourceContentsValue: unknown,
): { readonly ok: false; readonly code: "julia-final-recovery-v3-consumer-invalid" | "julia-final-recovery-v3-review-pending" } {
  const handoff = parseJuliaPixelActivationHandoffV2(handoffValue); const census = parseJuliaPixelFinalCapabilityCensusV3(censusValue); const authority = parseJuliaPixelFinalAuthorityManifestV2(authorityValue); const audit = parseJuliaFinalRecoveryAuditV2(auditValue);
  const baseline = parseJuliaFinalCapabilityCensusV1(baselineValue); const contract = parseJuliaPixelRecoveryContractV1(contractValue); const predecessor = parseJuliaPixelFinalCapabilityCensusV2(predecessorValue, contractValue); const predecessorAudit = parseJuliaFinalRecoveryAuditV1(predecessorAuditValue); const corrective = parseJuliaClassicRegressionCorrectiveV1(correctiveValue); const renderer = parseJuliaClassicRegressionRendererEvidenceV1(rendererValue);
  if (!handoff.ok || !census.ok || !authority.ok || !audit.ok || !baseline.ok || !contract.ok || !predecessor.ok || !predecessorAudit.ok || !corrective.ok || !renderer.ok || !plain(currentSourceContentsValue)) return { ok: false, code: "julia-final-recovery-v3-consumer-invalid" };
  const paths = JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS;
  if (!exact(currentSourceContentsValue, paths) || paths.some((path) => typeof currentSourceContentsValue[path] !== "string")) return { ok: false, code: "julia-final-recovery-v3-consumer-invalid" };
  const expectedBindings = Object.fromEntries(paths.map((path) => [path, sha256HexSyncV1(currentSourceContentsValue[path] as string)]));
  const predecessors = predecessor.value.rows; const corrections = new Map(corrective.value.rows.map((row) => [row.formulaId, row])); const evidence = new Map(renderer.value.rows.map((row) => [row.formulaId, row]));
  const eligible = predecessors.filter((row) => row.modeClass === "classic-julia" && row.finalStatus === "held" && row.supportLane === "none" && row.remediationLane === "canonical-rebind").map((row) => row.formulaId).sort();
  const correctiveIds = corrective.value.rows.map((row) => row.formulaId).sort(); const rendererIds = renderer.value.rows.filter((row) => row.status === "passed").map((row) => row.formulaId).sort(); const regressionIds = [...predecessorAudit.value.regressionIds];
  const targets = eligible.filter((id) => corrections.has(id) && evidence.has(id) && regressionIds.includes(id));
  if (!same(targets, correctiveIds) || !same(targets, rendererIds) || targets.some((id) => !regressionIds.includes(id)) || targets.length !== 7 || !same(census.value.rows.map((row) => row.formulaId), predecessors.map((row) => row.formulaId))) return { ok: false, code: "julia-final-recovery-v3-consumer-invalid" };
  const targetSet = new Set(targets);
  for (let index = 0; index < ROWS; index += 1) {
    const old = predecessors[index]!; const row = census.value.rows[index]!;
    if (!targetSet.has(old.formulaId)) { if (!same(row, old)) return { ok: false, code: "julia-final-recovery-v3-consumer-invalid" }; continue; }
    const correction = corrections.get(old.formulaId)!; const rendererRow = evidence.get(old.formulaId)!;
    const role = correction.supportLane === "source-split-direct" ? "role:pixel-constant" : "role:derived-pixel-constant";
    const expectedRoles = [...new Set([...old.roles.filter((item) => item !== "role:pixel-constant" && item !== "role:derived-pixel-constant"), role])].sort((a, b) => ["role:pixel-seed", "role:pixel-constant", "role:julia-constant", "role:derived-pixel-constant", "role:formula-parameter", "role:dynamic-orbit-state", "role:bailout-control", "role:unresolved"].indexOf(a) - ["role:pixel-seed", "role:pixel-constant", "role:julia-constant", "role:derived-pixel-constant", "role:formula-parameter", "role:dynamic-orbit-state", "role:bailout-control", "role:unresolved"].indexOf(b));
    const expected = { ...old, roles: expectedRoles, supportLane: correction.supportLane, remediationLane: "none", rewriteClass: "E0-operational-equivalence", finalStatus: "supported", identityChangeProposalRef: null, evidence: { tier0: "pass", tier1: "pass", tier2: "pass", identityReview: "not-required", e1Supplement: "not-required", e1SealedHoldout: "not-required", notApplicableReview: "not-required" }, receipts: { ...old.receipts, sourceAuthority: `sha256:${correction.candidateSourceRevision}`, directPixelSeed: `sha256:${correction.e0.analysisContentHash}`, tier0: `sha256:${correction.rowReceipt}`, tier1: `sha256:${correction.rowReceipt}`, tier2: `sha256:${rendererRow.receipt}`, identityReview: null, e1Supplement: null, e1SealedHoldout: null, notApplicableReview: null }, authority: { authorityState: "sealed", supersededBy: null, withdrawnBy: null } };
    if (!same(row, expected)) return { ok: false, code: "julia-final-recovery-v3-consumer-invalid" };
  }
  const status = (name: string) => census.value.rows.filter((row) => row.finalStatus === name).map((row) => row.formulaId).sort(); const supported = status("supported"); const held = status("held"); const blocked = status("blocked"); const unknown = status("unknown"); const notApplicable = status("not-applicable"); const baselineSupported = baseline.value.rows.filter((row) => row.status === "supported").map((row) => row.formulaId).sort(); const gains = supported.filter((id) => !baselineSupported.includes(id)); const regressions = baselineSupported.filter((id) => !supported.includes(id));
  const authorityInputs = [baseline.value.contentHash, predecessor.value.contentHash, contract.value.contentHash, corrective.value.contentHash, renderer.value.contentHash].sort();
  if (!same(authority.value.sourceBindings, expectedBindings) || !same(audit.value.sourceBindings, expectedBindings) || authority.value.finalCensusContentHash !== census.value.contentHash || !same(authority.value.inputAuthorityContentHashes, authorityInputs) || handoff.value.finalCensusContentHash !== census.value.contentHash || handoff.value.authorityManifestContentHash !== authority.value.contentHash || handoff.value.supportedClassicRowCount !== supported.length || handoff.value.regressionCount !== regressions.length || handoff.value.supportedClassicRowSetDigest !== sha256HexSyncV1(canonicalJsonV1(supported, 4096)) || handoff.value.regressionSetDigest !== sha256HexSyncV1(canonicalJsonV1(regressions, 4096)) || audit.value.baselineContentHash !== baseline.value.contentHash || audit.value.predecessorContentHash !== predecessor.value.contentHash || audit.value.contractContentHash !== contract.value.contentHash || audit.value.correctiveContentHash !== corrective.value.contentHash || audit.value.rendererEvidenceContentHash !== renderer.value.contentHash || audit.value.finalCensusContentHash !== census.value.contentHash || audit.value.authorityManifestContentHash !== authority.value.contentHash || audit.value.activationHandoffContentHash !== handoff.value.contentHash || !same(audit.value.supportedClassicIds, supported) || !same(audit.value.heldIds, held) || !same(audit.value.blockedIds, blocked) || !same(audit.value.unknownIds, unknown) || !same(audit.value.notApplicableIds, notApplicable) || !same(audit.value.gainIds, gains) || !same(audit.value.regressionIds, regressions) || !same(audit.value.recoveredRegressionIds, targets)) return { ok: false, code: "julia-final-recovery-v3-consumer-invalid" };
  return { ok: false, code: "julia-final-recovery-v3-review-pending" };
}
