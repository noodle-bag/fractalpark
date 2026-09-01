import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

import oldFinalAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import candidatesAsset from "../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import roleAsset from "../resources/formula-library/v1/julia-pixel-role-census.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import rendererAsset from "../resources/formula-library/v1/julia-renderer-evidence.v2.json";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1,
  parseJuliaFinalRecoveryAuditV1,
  verifyJuliaFinalRecoveryActivationHandoffV1,
} from "../src/engine/formulas/v1/julia-final-recovery-v2";
import {
  parseJuliaPixelActivationHandoffV1,
  parseJuliaPixelFinalAuthorityManifestV1,
  parseJuliaPixelFinalCapabilityCensusV2,
} from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { parseJuliaPixelRecoveryCandidatesV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-candidates";
import { parseJuliaPreGpuRecoveryCensusV2 } from "../src/engine/formulas/v1/julia-pre-gpu-recovery-v2";
import { parseJuliaRendererEvidenceV2 } from "../src/engine/formulas/v1/julia-renderer-evidence-v2";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import {
  verifyPrivateEvidenceFile,
  verifyPrivateEvidenceRoot,
} from "./lib/julia-private-evidence-root";

const ROOT = process.cwd();
const PRIVATE_RELATIVE_ROOT =
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1";
const PRIVATE_ROOT = join(ROOT, PRIVATE_RELATIVE_ROOT);
const PATHS = Object.freeze({
  census: join(
    ROOT,
    "resources/formula-library/v1/julia-pixel-final-capability-census.v2.json",
  ),
  authority: join(
    ROOT,
    "resources/formula-library/v1/julia-pixel-final-authority-manifest.v1.json",
  ),
  handoff: join(
    ROOT,
    "resources/formula-library/v1/julia-pixel-activation-handoff.v1.json",
  ),
  audit: join(
    ROOT,
    "resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json",
  ),
});
type JsonRecord = Record<string, unknown>;
const CANONICAL_NODE_BUDGET = 1_048_576;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(path: string): JsonRecord {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), `verify-julia-final-recovery-json-invalid:${path}`);
  return value;
}

function contentHash(value: JsonRecord): string {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  return sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET));
}

function privatePath(path: string): string {
  const root = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "verify-julia-final-recovery-private-root-invalid",
  );
  return verifyPrivateEvidenceFile(
    root,
    path,
    "verify-julia-final-recovery-private-path-invalid",
  );
}

function readPrivate(path: string): JsonRecord {
  const entryStat = lstatSync(path);
  invariant(
    entryStat.isFile() && !entryStat.isSymbolicLink(),
    "verify-julia-final-recovery-private-file-invalid",
  );
  const resolved = privatePath(path);
  const stat = lstatSync(resolved);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o600 &&
      stat.uid === process.getuid?.(),
    "verify-julia-final-recovery-private-file-invalid",
  );
  return readJson(resolved);
}

function currentSourceContents(): Record<string, string> {
  return Object.fromEntries(
    JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1.map((path) => [
      path,
      readFileSync(join(ROOT, path), "utf8"),
    ]),
  );
}

function sourceBindings(
  contents: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1.map((path) => [
      path,
      sha256HexSyncV1(contents[path]!),
    ]),
  );
}

function main(): void {
  const censusRaw = readJson(PATHS.census);
  const authorityRaw = readJson(PATHS.authority);
  const handoffRaw = readJson(PATHS.handoff);
  const auditRaw = readJson(PATHS.audit);
  const census = parseJuliaPixelFinalCapabilityCensusV2(
    censusRaw,
    contractAsset,
  );
  const authority = parseJuliaPixelFinalAuthorityManifestV1(authorityRaw);
  const handoff = parseJuliaPixelActivationHandoffV1(handoffRaw);
  const audit = parseJuliaFinalRecoveryAuditV1(auditRaw);
  const candidates = parseJuliaPixelRecoveryCandidatesV1(candidatesAsset);
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  const renderer = parseJuliaRendererEvidenceV2(rendererAsset);
  const oldFinal = parseJuliaFinalCapabilityCensusV1(oldFinalAsset);
  invariant(census.ok, "verify-julia-final-recovery-census-invalid");
  invariant(authority.ok, "verify-julia-final-recovery-authority-invalid");
  invariant(handoff.ok, "verify-julia-final-recovery-handoff-invalid");
  invariant(audit.ok, "verify-julia-final-recovery-audit-invalid");
  invariant(candidates.ok, "verify-julia-final-recovery-candidates-invalid");
  invariant(preGpu.ok, "verify-julia-final-recovery-pre-gpu-invalid");
  invariant(renderer.ok, "verify-julia-final-recovery-renderer-invalid");
  invariant(oldFinal.ok, "verify-julia-final-recovery-baseline-invalid");
  invariant(
    record(roleAsset) &&
      roleAsset.contentHash === contentHash(roleAsset as JsonRecord) &&
      record(candidatesAsset) &&
      candidatesAsset.contentHash === contentHash(candidatesAsset as JsonRecord),
    "verify-julia-final-recovery-input-hash-invalid",
  );
  const roleRows = roleAsset.rows as unknown as JsonRecord[];
  invariant(
    roleRows.length === census.value.rowCount &&
      candidates.value.rows.length === census.value.rowCount &&
      roleRows.every(
        (row, index) =>
          row.formulaId === census.value.rows[index]?.formulaId &&
          candidates.value.rows[index]?.formulaId === row.formulaId &&
          candidates.value.rows[index]?.roleReceipt === row.roleReceipt,
      ) &&
      preGpu.value.contractContentHash === census.value.contractContentHash &&
      preGpu.value.recoveryCandidatesContentHash === candidates.value.contentHash &&
      renderer.value.preGpuContentHash === preGpu.value.contentHash,
    "verify-julia-final-recovery-upstream-binding-invalid",
  );
  const rendererById = new Map(
    renderer.value.rows.map((row) => [row.formulaId, row]),
  );
  const preGpuById = new Map(
    preGpu.value.rows.map((row) => [row.formulaId, row]),
  );
  const supportedIds: string[] = [];
  const heldIds: string[] = [];
  const blockedIds: string[] = [];
  const unknownIds: string[] = [];
  const generalizedHeldIds: string[] = [];
  for (let index = 0; index < census.value.rows.length; index += 1) {
    const row = census.value.rows[index]!;
    const pre = preGpuById.get(row.formulaId);
    const rendererRow = rendererById.get(row.formulaId);
    const role = roleRows[index];
    invariant(pre, `verify-julia-final-recovery-pre-row-missing:${row.formulaId}`);
    invariant(
      record(role) &&
        role.formulaId === row.formulaId &&
        typeof role.roleReceipt === "string" &&
        record(role.changedRegionReceipt) &&
        typeof role.changedRegionReceipt.analysisContentHash === "string",
      `verify-julia-final-recovery-role-row-invalid:${row.formulaId}`,
    );
    const reference = (hash: string): string => `sha256:${hash}`;
    const modeClass =
      pre.supportLane === "none" ? String(role.modeClass) : "classic-julia";
    invariant(
      row.modeClass === modeClass &&
        row.rewriteClass === (pre.rewriteClass ?? "none") &&
        row.evidence.tier0 === pre.tier0 &&
        row.evidence.tier1 === pre.tier1 &&
        row.receipts.roleDiscovery === role.roleReceipt &&
        row.receipts.sourceAuthority ===
          (pre.candidateContentHash === null
            ? null
            : reference(pre.candidateContentHash)) &&
        row.receipts.directPixelSeed ===
          (modeClass === "classic-julia"
            ? reference(String(role.changedRegionReceipt.analysisContentHash))
            : null) &&
        row.receipts.tier0 ===
          (pre.tier0 === "pass" || pre.tier0 === "fail"
            ? reference(pre.rowReceipt)
            : null) &&
        row.receipts.tier1 ===
          (pre.tier1 === "pass" || pre.tier1 === "fail"
            ? reference(pre.rowReceipt)
            : null) &&
        row.receipts.tier2 ===
          (rendererRow === undefined
            ? null
            : reference(
                sha256HexSyncV1(canonicalJsonV1(rendererRow, 64_000)),
              )),
      `verify-julia-final-recovery-receipt-invalid:${row.formulaId}`,
    );
    if (pre.status === "tier2-queue") {
      invariant(
        rendererRow &&
          row.finalStatus ===
            (rendererRow.status === "passed" ? "supported" : "blocked") &&
          row.supportLane === pre.supportLane &&
          row.evidence.tier2 ===
            (rendererRow.status === "passed" ? "pass" : "fail") &&
          row.receipts.tier2 !== null,
        `verify-julia-final-recovery-renderer-row-invalid:${row.formulaId}`,
      );
    } else {
      invariant(
        !rendererRow &&
          row.finalStatus ===
            (pre.status === "held"
              ? "held"
              : pre.status === "unknown"
                ? "unknown"
                : "blocked") &&
          row.evidence.tier2 === "not-required" &&
          row.receipts.tier2 === null,
        `verify-julia-final-recovery-non-renderer-row-invalid:${row.formulaId}`,
      );
    }
    if (row.finalStatus === "supported") supportedIds.push(row.formulaId);
    if (row.finalStatus === "held") heldIds.push(row.formulaId);
    if (row.finalStatus === "blocked") blockedIds.push(row.formulaId);
    if (row.finalStatus === "unknown") unknownIds.push(row.formulaId);
    if (
      row.finalStatus === "held" &&
      row.modeClass === "generalized-two-plane"
    )
      generalizedHeldIds.push(row.formulaId);
  }
  const oldSupportedIds = oldFinal.value.rows
    .filter((row) => row.status === "supported")
    .map((row) => row.formulaId)
    .sort();
  const supportedSet = new Set(supportedIds);
  const oldSupportedSet = new Set(oldSupportedIds);
  const regressionIds = oldSupportedIds.filter((id) => !supportedSet.has(id));
  const gainIds = supportedIds.filter((id) => !oldSupportedSet.has(id));
  invariant(
    supportedIds.length === 179 &&
      heldIds.length === 167 &&
      blockedIds.length === 72 &&
      unknownIds.length === 116 &&
      regressionIds.length === 27 &&
      gainIds.length === 36,
    "verify-julia-final-recovery-counts-invalid",
  );
  invariant(
    authority.value.finalCensusContentHash === census.value.contentHash &&
      handoff.value.finalCensusContentHash === census.value.contentHash &&
      handoff.value.authorityManifestContentHash === authority.value.contentHash &&
      handoff.value.handoffState === "review-pending" &&
      handoff.value.maintainerAcknowledgmentReceiptDigest === null &&
      handoff.value.supportedClassicRowCount === supportedIds.length &&
      handoff.value.supportedClassicRowSetDigest ===
        sha256HexSyncV1(canonicalJsonV1(supportedIds, 4_096)) &&
      handoff.value.regressionCount === regressionIds.length &&
      handoff.value.regressionSetDigest ===
        sha256HexSyncV1(canonicalJsonV1(regressionIds, 4_096)),
    "verify-julia-final-recovery-handoff-binding-invalid",
  );
  invariant(
    audit.value.contractContentHash === census.value.contractContentHash &&
      audit.value.roleCensusContentHash === roleAsset.contentHash &&
      audit.value.recoveryCandidatesContentHash === candidates.value.contentHash &&
      audit.value.preGpuContentHash === preGpu.value.contentHash &&
      audit.value.rendererEvidenceContentHash === renderer.value.contentHash &&
      audit.value.finalCensusContentHash === census.value.contentHash &&
      audit.value.authorityManifestContentHash === authority.value.contentHash &&
      audit.value.activationHandoffContentHash === handoff.value.contentHash &&
      canonicalJsonV1(audit.value.supportedClassicIds) ===
        canonicalJsonV1(supportedIds) &&
      canonicalJsonV1(audit.value.heldIds) === canonicalJsonV1(heldIds) &&
      canonicalJsonV1(audit.value.generalizedHeldIds) ===
        canonicalJsonV1(generalizedHeldIds) &&
      canonicalJsonV1(audit.value.blockedIds) ===
        canonicalJsonV1(blockedIds) &&
      canonicalJsonV1(audit.value.unknownIds) ===
        canonicalJsonV1(unknownIds) &&
      canonicalJsonV1(audit.value.regressionIds) ===
        canonicalJsonV1(regressionIds) &&
      canonicalJsonV1(audit.value.gainIds) === canonicalJsonV1(gainIds) &&
      audit.value.notApplicableIds.length === 0 &&
      audit.value.identityChangeProposalRefs.length === 0 &&
      canonicalJsonV1(
        audit.value.sealedAttemptCounts.map((row) => row.formulaId),
      ) === canonicalJsonV1(census.value.rows.map((row) => row.formulaId)),
    "verify-julia-final-recovery-audit-binding-invalid",
  );
  const expectedSourceContents = currentSourceContents();
  const expectedSourceBindings = sourceBindings(expectedSourceContents);
  invariant(
    canonicalJsonV1(audit.value.sourceBindings, 65_536) ===
      canonicalJsonV1(expectedSourceBindings, 65_536),
    "verify-julia-final-recovery-source-binding-invalid",
  );
  const attemptManifest = readPrivate(
    join(
      PRIVATE_ROOT,
      `holdout-attempt-manifest.wave-${audit.value.currentWaveId}.json`,
    ),
  );
  const sealedLedger = readPrivate(
    join(
      PRIVATE_ROOT,
      `attempt-ledger.sealed-${audit.value.currentWaveId}.json`,
    ),
  );
  invariant(
    attemptManifest.contentHash === contentHash(attemptManifest) &&
      attemptManifest.rowCount === 0 &&
      sealedLedger.contentHash === contentHash(sealedLedger) &&
      sealedLedger.stage === "sealed" &&
      sealedLedger.waveId === renderer.value.waveId &&
      Array.isArray(sealedLedger.attempts) &&
      sealedLedger.attempts.length === 0 &&
      renderer.value.sealedHoldout.attemptManifestContentHash ===
        attemptManifest.contentHash &&
      renderer.value.sealedHoldout.sealedLedgerContentHash ===
        sealedLedger.contentHash &&
      audit.value.holdoutAttemptManifestContentHash ===
        attemptManifest.contentHash &&
      audit.value.sealedAttemptLedgerContentHash === sealedLedger.contentHash &&
      audit.value.sealedAttemptCounts.every(
        (row) =>
          row.historicalSealedAttemptCount === 0 &&
          row.currentWaveSealedAttemptCount === 0 &&
          row.cumulativeSealedAttemptCount === 0,
      ),
    "verify-julia-final-recovery-attempt-binding-invalid",
  );
  const expectedAuthorityHashes = [
    census.value.contractContentHash,
    String(roleAsset.contentHash),
    candidates.value.contentHash,
    preGpu.value.contentHash,
    renderer.value.contentHash,
    String(attemptManifest.contentHash),
    String(sealedLedger.contentHash),
    oldFinal.value.contentHash,
  ].sort();
  invariant(
    canonicalJsonV1(authority.value.inputAuthorityContentHashes) ===
      canonicalJsonV1(expectedAuthorityHashes),
    "verify-julia-final-recovery-authority-set-invalid",
  );
  const consumer = verifyJuliaFinalRecoveryActivationHandoffV1(
    handoffRaw,
    censusRaw,
    authorityRaw,
    auditRaw,
    contractAsset,
    oldFinalAsset,
    roleAsset,
    candidatesAsset,
    preGpuAsset,
    rendererAsset,
    attemptManifest,
    sealedLedger,
    expectedSourceContents,
  );
  invariant(
    !consumer.ok && consumer.code === "julia-final-recovery-review-pending",
    "verify-julia-final-recovery-consumer-state-invalid",
  );
  invariant(
    canonicalJsonV1(sourceBindings(currentSourceContents()), 65_536) ===
      canonicalJsonV1(expectedSourceBindings, 65_536),
    "verify-julia-final-recovery-source-drift",
  );
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      independentlyReplayed: true,
      rowCount: census.value.rowCount,
      supported: supportedIds.length,
      held: heldIds.length,
      blocked: blockedIds.length,
      unknown: unknownIds.length,
      regressions: regressionIds.length,
      gains: gainIds.length,
      handoffState: handoff.value.handoffState,
      finalCensusContentHash: census.value.contentHash,
      auditContentHash: audit.value.contentHash,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "verify-julia-final-recovery-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
