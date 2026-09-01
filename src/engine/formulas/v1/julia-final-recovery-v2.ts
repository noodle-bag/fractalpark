import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";
import { parseJuliaFinalCapabilityCensusV1 } from "./julia-final-capability";
import { parseJuliaPixelRecoveryCandidatesV1 } from "./julia-pixel-recovery-candidates";
import {
  parseJuliaPixelActivationHandoffV1,
  parseJuliaPixelFinalAuthorityManifestV1,
  parseJuliaPixelFinalCapabilityCensusV2,
  parseJuliaPixelRecoveryContractV1,
} from "./julia-pixel-recovery-contract";
import { parseJuliaPreGpuRecoveryCensusV2 } from "./julia-pre-gpu-recovery-v2";
import { parseJuliaRendererEvidenceV2 } from "./julia-renderer-evidence-v2";

export const JULIA_FINAL_RECOVERY_AUDIT_SCHEMA_V1 =
  "fractalpark-julia-pixel-final-recovery-audit/v1" as const;
export const JULIA_FINAL_RECOVERY_ROW_COUNT_V1 = 534 as const;
export const JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1 = Object.freeze([
  "package-lock.json",
  "package.json",
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/julia-pixel-role-census.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json",
  "resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json",
  "resources/formula-library/v1/julia-renderer-evidence.v2.json",
  "scripts/build-julia-final-recovery-v2.ts",
  "scripts/lib/julia-private-evidence-root.ts",
  "scripts/verify-julia-final-recovery-v2.ts",
  "src/engine/formulas/v1/julia-final-recovery-v2.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/julia-pre-gpu-recovery-v2.ts",
  "src/engine/formulas/v1/julia-renderer-evidence-v2.ts",
  "src/engine/formulas/v1/revisions.ts",
  "tsconfig.json",
] as const);

export interface JuliaFinalRecoveryAttemptCountV1 {
  readonly formulaId: string;
  readonly historicalSealedAttemptCount: number;
  readonly currentWaveSealedAttemptCount: number;
  readonly cumulativeSealedAttemptCount: number;
}

export interface JuliaFinalRecoveryAuditV1 {
  readonly schema: typeof JULIA_FINAL_RECOVERY_AUDIT_SCHEMA_V1;
  readonly revision: 1;
  readonly authority: Readonly<{
    readonly authorityState: "sealed";
    readonly supersededBy: null;
    readonly withdrawnBy: null;
  }>;
  readonly contractContentHash: string;
  readonly roleCensusContentHash: string;
  readonly recoveryCandidatesContentHash: string;
  readonly preGpuContentHash: string;
  readonly rendererEvidenceContentHash: string;
  readonly holdoutAttemptManifestContentHash: string;
  readonly sealedAttemptLedgerContentHash: string;
  readonly finalCensusContentHash: string;
  readonly authorityManifestContentHash: string;
  readonly activationHandoffContentHash: string;
  readonly currentWaveId: string;
  readonly historicalCorpusDigests: readonly string[];
  readonly statusCounts: Readonly<{
    readonly supported: number;
    readonly held: number;
    readonly blocked: number;
    readonly unknown: number;
    readonly notApplicable: number;
  }>;
  readonly supportedClassicIds: readonly string[];
  readonly heldIds: readonly string[];
  readonly generalizedHeldIds: readonly string[];
  readonly blockedIds: readonly string[];
  readonly unknownIds: readonly string[];
  readonly notApplicableIds: readonly string[];
  readonly identityChangeProposalRefs: readonly string[];
  readonly regressionIds: readonly string[];
  readonly gainIds: readonly string[];
  readonly sealedAttemptCounts: readonly JuliaFinalRecoveryAttemptCountV1[];
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly contentHash: string;
}

type JsonRecord = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CANONICAL_NODE_BUDGET = 1_048_576;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  return (
    Object.keys(value).sort().join("|") === [...expected].sort().join("|")
  );
}

function sortedUniqueIds(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry, index, rows) =>
        typeof entry === "string" &&
        UUID_V5.test(entry) &&
        (index === 0 || rows[index - 1] < entry),
    )
  );
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (record(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, immutable(child)]),
      ),
    ) as T;
  }
  return value;
}

export function parseJuliaFinalRecoveryAuditV1(
  input: unknown,
):
  | { readonly ok: true; readonly value: JuliaFinalRecoveryAuditV1 }
  | { readonly ok: false; readonly code: "julia-final-recovery-audit-invalid" } {
  try {
    if (
      !record(input) ||
      !exactKeys(input, [
        "schema",
        "revision",
        "authority",
        "contractContentHash",
        "roleCensusContentHash",
        "recoveryCandidatesContentHash",
        "preGpuContentHash",
        "rendererEvidenceContentHash",
        "holdoutAttemptManifestContentHash",
        "sealedAttemptLedgerContentHash",
        "finalCensusContentHash",
        "authorityManifestContentHash",
        "activationHandoffContentHash",
        "currentWaveId",
        "historicalCorpusDigests",
        "statusCounts",
        "supportedClassicIds",
        "heldIds",
        "generalizedHeldIds",
        "blockedIds",
        "unknownIds",
        "notApplicableIds",
        "identityChangeProposalRefs",
        "regressionIds",
        "gainIds",
        "sealedAttemptCounts",
        "sourceBindings",
        "contentHash",
      ]) ||
      input.schema !== JULIA_FINAL_RECOVERY_AUDIT_SCHEMA_V1 ||
      input.revision !== 1 ||
      !record(input.authority) ||
      !exactKeys(input.authority, ["authorityState", "supersededBy", "withdrawnBy"]) ||
      input.authority.authorityState !== "sealed" ||
      input.authority.supersededBy !== null ||
      input.authority.withdrawnBy !== null ||
      ![
        input.contractContentHash,
        input.roleCensusContentHash,
        input.recoveryCandidatesContentHash,
        input.preGpuContentHash,
        input.rendererEvidenceContentHash,
        input.holdoutAttemptManifestContentHash,
        input.sealedAttemptLedgerContentHash,
        input.finalCensusContentHash,
        input.authorityManifestContentHash,
        input.activationHandoffContentHash,
        input.currentWaveId,
        input.contentHash,
      ].every((value) => typeof value === "string" && SHA256.test(value)) ||
      !Array.isArray(input.historicalCorpusDigests) ||
      input.historicalCorpusDigests.length === 0 ||
      !input.historicalCorpusDigests.every(
        (value, index, rows) =>
          typeof value === "string" &&
          SHA256.test(value) &&
          (index === 0 || rows[index - 1] < value),
      ) ||
      !record(input.statusCounts) ||
      !exactKeys(input.statusCounts, [
        "supported",
        "held",
        "blocked",
        "unknown",
        "notApplicable",
      ]) ||
      !Object.values(input.statusCounts).every(
        (value) => Number.isSafeInteger(value) && (value as number) >= 0,
      ) ||
      !sortedUniqueIds(input.supportedClassicIds) ||
      !sortedUniqueIds(input.heldIds) ||
      !sortedUniqueIds(input.generalizedHeldIds) ||
      !sortedUniqueIds(input.blockedIds) ||
      !sortedUniqueIds(input.unknownIds) ||
      !sortedUniqueIds(input.notApplicableIds) ||
      !Array.isArray(input.identityChangeProposalRefs) ||
      !input.identityChangeProposalRefs.every(
        (value, index, rows) =>
          typeof value === "string" &&
          SHA256.test(value) &&
          (index === 0 || rows[index - 1] < value),
      ) ||
      !sortedUniqueIds(input.regressionIds) ||
      !sortedUniqueIds(input.gainIds) ||
      !Array.isArray(input.sealedAttemptCounts) ||
      input.sealedAttemptCounts.length !== JULIA_FINAL_RECOVERY_ROW_COUNT_V1 ||
      !record(input.sourceBindings) ||
      Object.keys(input.sourceBindings).length === 0 ||
      !Object.values(input.sourceBindings).every(
        (value) => typeof value === "string" && SHA256.test(value),
      )
    )
      throw new Error("shape");
    const attempts = input.sealedAttemptCounts as unknown[];
    let previousFormulaId = "";
    for (let index = 0; index < attempts.length; index += 1) {
      const entry = attempts[index];
      if (
        !record(entry) ||
        !exactKeys(entry, [
          "formulaId",
          "historicalSealedAttemptCount",
          "currentWaveSealedAttemptCount",
          "cumulativeSealedAttemptCount",
        ]) ||
        typeof entry.formulaId !== "string" ||
        !UUID_V5.test(entry.formulaId) ||
        (index > 0 && previousFormulaId >= entry.formulaId) ||
        !Number.isSafeInteger(entry.historicalSealedAttemptCount) ||
        !Number.isSafeInteger(entry.currentWaveSealedAttemptCount) ||
        !Number.isSafeInteger(entry.cumulativeSealedAttemptCount) ||
        (entry.historicalSealedAttemptCount as number) < 0 ||
        (entry.currentWaveSealedAttemptCount as number) < 0 ||
        (entry.currentWaveSealedAttemptCount as number) > 1 ||
        entry.cumulativeSealedAttemptCount !==
          (entry.historicalSealedAttemptCount as number) +
            (entry.currentWaveSealedAttemptCount as number)
      )
        throw new Error("attempts");
      previousFormulaId = entry.formulaId;
    }
    const supported = input.supportedClassicIds as string[];
    const held = input.heldIds as string[];
    const blocked = input.blockedIds as string[];
    const unknown = input.unknownIds as string[];
    const notApplicable = input.notApplicableIds as string[];
    const partition = [...supported, ...held, ...blocked, ...unknown, ...notApplicable];
    if (
      new Set(partition).size !== JULIA_FINAL_RECOVERY_ROW_COUNT_V1 ||
      partition.length !== JULIA_FINAL_RECOVERY_ROW_COUNT_V1 ||
      (input.generalizedHeldIds as string[]).some((id) => !held.includes(id)) ||
      input.statusCounts.supported !== supported.length ||
      input.statusCounts.held !== held.length ||
      input.statusCounts.blocked !== blocked.length ||
      input.statusCounts.unknown !== unknown.length ||
      input.statusCounts.notApplicable !== notApplicable.length
    )
      throw new Error("partition");
    const content = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "contentHash"),
    );
    if (
      input.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    )
      throw new Error("hash");
    return {
      ok: true,
      value: immutable(input) as unknown as JuliaFinalRecoveryAuditV1,
    };
  } catch {
    return { ok: false, code: "julia-final-recovery-audit-invalid" };
  }
}

export function verifyJuliaFinalRecoveryActivationHandoffV1(
  handoffValue: unknown,
  censusValue: unknown,
  authorityManifestValue: unknown,
  auditValue: unknown,
  contractValue: unknown,
  baselineValue: unknown,
  roleCensusValue: unknown,
  recoveryCandidatesValue: unknown,
  preGpuValue: unknown,
  rendererValue: unknown,
  holdoutAttemptManifestValue: unknown,
  sealedAttemptLedgerValue: unknown,
  currentSourceContentsValue: unknown,
):
  | {
      readonly ok: true;
      readonly supportedClassicIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code:
        | "julia-final-recovery-consumer-invalid"
        | "julia-final-recovery-review-pending";
    } {
  const handoff = parseJuliaPixelActivationHandoffV1(handoffValue);
  const census = parseJuliaPixelFinalCapabilityCensusV2(
    censusValue,
    contractValue,
  );
  const authority = parseJuliaPixelFinalAuthorityManifestV1(
    authorityManifestValue,
  );
  const audit = parseJuliaFinalRecoveryAuditV1(auditValue);
  const contract = parseJuliaPixelRecoveryContractV1(contractValue);
  const baseline = parseJuliaFinalCapabilityCensusV1(baselineValue);
  const candidates = parseJuliaPixelRecoveryCandidatesV1(recoveryCandidatesValue);
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuValue);
  const renderer = parseJuliaRendererEvidenceV2(rendererValue);
  if (
    !handoff.ok ||
    !census.ok ||
    !authority.ok ||
    !audit.ok ||
    !contract.ok ||
    !baseline.ok ||
    !candidates.ok ||
    !preGpu.ok ||
    !renderer.ok ||
    !record(roleCensusValue) ||
    !record(holdoutAttemptManifestValue) ||
    !record(sealedAttemptLedgerValue) ||
    !record(currentSourceContentsValue)
  )
    return { ok: false, code: "julia-final-recovery-consumer-invalid" };

  const hashMatches = (value: JsonRecord): boolean => {
    const content = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "contentHash"),
    );
    return (
      typeof value.contentHash === "string" &&
      SHA256.test(value.contentHash) &&
      value.contentHash ===
        sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    );
  };
  const same = (left: unknown, right: unknown, budget = 65_536): boolean =>
    canonicalJsonV1(left, budget) === canonicalJsonV1(right, budget);
  const sourcePaths = [...JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1];
  const suppliedSourcePaths = Object.keys(currentSourceContentsValue).sort();
  if (
    !same(suppliedSourcePaths, [...sourcePaths].sort()) ||
    sourcePaths.some(
      (path) => typeof currentSourceContentsValue[path] !== "string",
    )
  )
    return { ok: false, code: "julia-final-recovery-consumer-invalid" };
  const currentSourceBindings = Object.fromEntries(
    sourcePaths.map((path) => [
      path,
      sha256HexSyncV1(currentSourceContentsValue[path] as string),
    ]),
  );
  if (
    !hashMatches(roleCensusValue) ||
    roleCensusValue.rowCount !== JULIA_FINAL_RECOVERY_ROW_COUNT_V1 ||
    !Array.isArray(roleCensusValue.rows) ||
    roleCensusValue.rows.length !== JULIA_FINAL_RECOVERY_ROW_COUNT_V1 ||
    !hashMatches(holdoutAttemptManifestValue) ||
    holdoutAttemptManifestValue.rowCount !== 0 ||
    !hashMatches(sealedAttemptLedgerValue) ||
    sealedAttemptLedgerValue.stage !== "sealed" ||
    sealedAttemptLedgerValue.waveId !== renderer.value.waveId ||
    !Array.isArray(sealedAttemptLedgerValue.attempts) ||
    sealedAttemptLedgerValue.attempts.length !== 0 ||
    preGpu.value.contractContentHash !== contract.value.contentHash ||
    preGpu.value.recoveryCandidatesContentHash !== candidates.value.contentHash ||
    renderer.value.preGpuContentHash !== preGpu.value.contentHash ||
    renderer.value.sealedHoldout.attemptManifestContentHash !==
      holdoutAttemptManifestValue.contentHash ||
    renderer.value.sealedHoldout.sealedLedgerContentHash !==
      sealedAttemptLedgerValue.contentHash
  )
    return { ok: false, code: "julia-final-recovery-consumer-invalid" };

  const roleRows = roleCensusValue.rows as unknown[];
  const candidateRows = candidates.value.rows;
  const rendererById = new Map(
    renderer.value.rows.map((row) => [row.formulaId, row]),
  );
  for (let index = 0; index < census.value.rows.length; index += 1) {
    const row = census.value.rows[index]!;
    const pre = preGpu.value.rows[index]!;
    const role = roleRows[index];
    const candidate = candidateRows[index];
    if (
      !record(role) ||
      role.formulaId !== row.formulaId ||
      candidate?.formulaId !== row.formulaId ||
      candidate.roleReceipt !== role.roleReceipt ||
      pre.formulaId !== row.formulaId ||
      typeof role.roleReceipt !== "string" ||
      !record(role.changedRegionReceipt) ||
      typeof role.changedRegionReceipt.analysisContentHash !== "string" ||
      !SHA256.test(role.changedRegionReceipt.analysisContentHash)
    )
      return { ok: false, code: "julia-final-recovery-consumer-invalid" };
    const rendererRow = rendererById.get(row.formulaId);
    const modeClass =
      pre.supportLane === "none" ? String(role.modeClass) : "classic-julia";
    const expectedStatus =
      pre.status === "tier2-queue"
        ? rendererRow?.status === "passed"
          ? "supported"
          : "blocked"
        : pre.status === "held"
          ? "held"
          : pre.status === "unknown"
            ? "unknown"
            : "blocked";
    const expectedTier2 = rendererRow
      ? rendererRow.status === "passed"
        ? "pass"
        : "fail"
      : "not-required";
    const reference = (hash: string): string => `sha256:${hash}`;
    if (
      row.modeClass !== modeClass ||
      row.supportLane !== pre.supportLane ||
      row.rewriteClass !== (pre.rewriteClass ?? "none") ||
      row.finalStatus !== expectedStatus ||
      row.evidence.tier0 !== pre.tier0 ||
      row.evidence.tier1 !== pre.tier1 ||
      row.evidence.tier2 !== expectedTier2 ||
      row.receipts.roleDiscovery !== role.roleReceipt ||
      row.receipts.sourceAuthority !==
        (pre.candidateContentHash === null
          ? null
          : reference(pre.candidateContentHash)) ||
      row.receipts.directPixelSeed !==
        (modeClass === "classic-julia"
          ? reference(role.changedRegionReceipt.analysisContentHash)
          : null) ||
      row.receipts.tier0 !==
        (pre.tier0 === "pass" || pre.tier0 === "fail"
          ? reference(pre.rowReceipt)
          : null) ||
      row.receipts.tier1 !==
        (pre.tier1 === "pass" || pre.tier1 === "fail"
          ? reference(pre.rowReceipt)
          : null) ||
      row.receipts.tier2 !==
        (rendererRow === undefined
          ? null
          : reference(
              sha256HexSyncV1(canonicalJsonV1(rendererRow, 64_000)),
            ))
    )
      return { ok: false, code: "julia-final-recovery-consumer-invalid" };
  }

  const supportedClassicIds: string[] = [];
  const heldIds: string[] = [];
  const generalizedHeldIds: string[] = [];
  const blockedIds: string[] = [];
  const unknownIds: string[] = [];
  const notApplicableIds: string[] = [];
  const identityChangeProposalRefs: string[] = [];
  for (const row of census.value.rows) {
    if (row.finalStatus === "supported") supportedClassicIds.push(row.formulaId);
    if (row.finalStatus === "held") heldIds.push(row.formulaId);
    if (
      row.finalStatus === "held" &&
      row.modeClass === "generalized-two-plane"
    )
      generalizedHeldIds.push(row.formulaId);
    if (row.finalStatus === "blocked") blockedIds.push(row.formulaId);
    if (row.finalStatus === "unknown") unknownIds.push(row.formulaId);
    if (row.finalStatus === "not-applicable")
      notApplicableIds.push(row.formulaId);
    if (row.identityChangeProposalRef !== null)
      identityChangeProposalRefs.push(row.identityChangeProposalRef.slice(7));
  }
  supportedClassicIds.sort();
  heldIds.sort();
  generalizedHeldIds.sort();
  blockedIds.sort();
  unknownIds.sort();
  notApplicableIds.sort();
  identityChangeProposalRefs.sort();
  const supportedSet = new Set(supportedClassicIds);
  const baselineSupportedIds = baseline.value.rows
    .filter((row) => row.status === "supported")
    .map((row) => row.formulaId)
    .sort();
  const baselineSupportedSet = new Set(baselineSupportedIds);
  const regressionIds = baselineSupportedIds.filter((id) => !supportedSet.has(id));
  const gainIds = supportedClassicIds.filter((id) => !baselineSupportedSet.has(id));
  const supportedDigest = sha256HexSyncV1(
    canonicalJsonV1(supportedClassicIds, 4_096),
  );
  const regressionDigest = sha256HexSyncV1(
    canonicalJsonV1(regressionIds, 4_096),
  );
  const expectedAuthorityHashes = [
    contract.value.contentHash,
    roleCensusValue.contentHash as string,
    candidates.value.contentHash,
    preGpu.value.contentHash,
    renderer.value.contentHash,
    holdoutAttemptManifestValue.contentHash as string,
    sealedAttemptLedgerValue.contentHash as string,
    baseline.value.contentHash,
  ].sort();
  const historicalCorpusDigests = [
    ...contract.value.holdoutContract.historicalCorpusDigests,
    String(sealedAttemptLedgerValue.currentCorpusDigest),
  ].sort();

  if (
    authority.value.finalCensusContentHash !== census.value.contentHash ||
    !same(authority.value.inputAuthorityContentHashes, expectedAuthorityHashes) ||
    handoff.value.maintainerAcknowledgmentReceiptDigest !== null ||
    handoff.value.finalCensusContentHash !== census.value.contentHash ||
    handoff.value.authorityManifestContentHash !== authority.value.contentHash ||
    handoff.value.supportedClassicRowCount !== supportedClassicIds.length ||
    handoff.value.supportedClassicRowSetDigest !== supportedDigest ||
    handoff.value.regressionCount !== regressionIds.length ||
    handoff.value.regressionSetDigest !== regressionDigest ||
    audit.value.contractContentHash !== contract.value.contentHash ||
    audit.value.roleCensusContentHash !== roleCensusValue.contentHash ||
    audit.value.recoveryCandidatesContentHash !== candidates.value.contentHash ||
    audit.value.preGpuContentHash !== preGpu.value.contentHash ||
    audit.value.rendererEvidenceContentHash !== renderer.value.contentHash ||
    audit.value.holdoutAttemptManifestContentHash !==
      holdoutAttemptManifestValue.contentHash ||
    audit.value.sealedAttemptLedgerContentHash !==
      sealedAttemptLedgerValue.contentHash ||
    audit.value.finalCensusContentHash !== census.value.contentHash ||
    audit.value.authorityManifestContentHash !== authority.value.contentHash ||
    audit.value.activationHandoffContentHash !== handoff.value.contentHash ||
    !same(audit.value.supportedClassicIds, supportedClassicIds) ||
    !same(audit.value.heldIds, heldIds) ||
    !same(audit.value.generalizedHeldIds, generalizedHeldIds) ||
    !same(audit.value.blockedIds, blockedIds) ||
    !same(audit.value.unknownIds, unknownIds) ||
    !same(audit.value.notApplicableIds, notApplicableIds) ||
    !same(audit.value.identityChangeProposalRefs, identityChangeProposalRefs) ||
    !same(audit.value.regressionIds, regressionIds) ||
    !same(audit.value.gainIds, gainIds) ||
    !same(audit.value.historicalCorpusDigests, historicalCorpusDigests) ||
    !same(audit.value.sourceBindings, currentSourceBindings) ||
    !same(
      audit.value.sealedAttemptCounts.map((row) => row.formulaId),
      census.value.rows.map((row) => row.formulaId),
    ) ||
    audit.value.sealedAttemptCounts.some(
      (row) =>
        row.historicalSealedAttemptCount !== 0 ||
        row.currentWaveSealedAttemptCount !== 0 ||
        row.cumulativeSealedAttemptCount !== 0,
    )
  )
    return { ok: false, code: "julia-final-recovery-consumer-invalid" };
  if (handoff.value.handoffState !== "activation-eligible")
    return { ok: false, code: "julia-final-recovery-review-pending" };
  return {
    ok: true,
    supportedClassicIds: Object.freeze([...supportedClassicIds]),
  };
}
