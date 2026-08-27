import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import oldFinalAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import candidatesAsset from "../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import roleAsset from "../resources/formula-library/v1/julia-pixel-role-census.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import rendererAsset from "../resources/formula-library/v1/julia-renderer-evidence.v2.json";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  JULIA_FINAL_RECOVERY_AUDIT_SCHEMA_V1,
  JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1,
  parseJuliaFinalRecoveryAuditV1,
} from "../src/engine/formulas/v1/julia-final-recovery-v2";
import {
  JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1,
  JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1,
  JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2,
  JULIA_PIXEL_RECOVERY_ROLES_V1,
  parseJuliaPixelActivationHandoffV1,
  parseJuliaPixelFinalAuthorityManifestV1,
  parseJuliaPixelFinalCapabilityCensusV2,
  parseJuliaPixelRecoveryContractV1,
  parseJuliaPixelRecoveryProjectionRowV1,
  type JuliaPixelRecoveryProjectionRowV1,
} from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
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
const OUTPUTS = Object.freeze({
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
const CANONICAL_NODE_BUDGET = 1_048_576;
const SHA256 = /^[a-f0-9]{64}$/;
type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function contentHash(value: JsonRecord): string {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  return sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET));
}

function hashContent<T extends Record<string, unknown>>(content: T) {
  return {
    ...content,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
    ),
  };
}

function reference(hash: string): string {
  invariant(SHA256.test(hash), "julia-final-recovery-reference-invalid");
  return `sha256:${hash}`;
}

function sourceBindings(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      JULIA_FINAL_RECOVERY_SOURCE_BINDING_PATHS_V1.map((path) => [
        path,
        sha256HexSyncV1(readFileSync(join(ROOT, path), "utf8")),
      ]),
    ),
  );
}

function privatePath(path: string): string {
  const root = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "julia-final-recovery-private-root-invalid",
  );
  return verifyPrivateEvidenceFile(
    root,
    path,
    "julia-final-recovery-private-path-invalid",
  );
}

function readPrivateJson(path: string): JsonRecord {
  const entryStat = lstatSync(path);
  invariant(
    entryStat.isFile() && !entryStat.isSymbolicLink(),
    "julia-final-recovery-private-file-invalid",
  );
  const resolved = privatePath(path);
  const stat = lstatSync(resolved);
  invariant(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.nlink === 1 &&
      (stat.mode & 0o777) === 0o600 &&
      stat.uid === process.getuid?.(),
    "julia-final-recovery-private-file-invalid",
  );
  const value: unknown = JSON.parse(readFileSync(resolved, "utf8"));
  invariant(record(value), "julia-final-recovery-private-json-invalid");
  return value;
}

function remediationLane(
  finalStatus: string,
  modeClass: string,
  reasonCodes: readonly string[],
  rendererBlocked: boolean,
): JuliaPixelRecoveryProjectionRowV1["remediationLane"] {
  if (finalStatus === "supported") return "none";
  if (rendererBlocked) return "renderer-diagnosis";
  if (reasonCodes.some((reason) => reason.includes("mutable")))
    return "mutable-state-separation";
  if (
    modeClass === "generalized-two-plane" ||
    reasonCodes.some((reason) => reason.includes("generalized"))
  )
    return "identity-review";
  if (
    reasonCodes.some(
      (reason) =>
        reason.includes("non-finite") ||
        reason.includes("insensitive"),
    )
  )
    return "tier1-numeric-diagnosis";
  if (finalStatus === "unknown") return "role-discovery";
  return "canonical-rebind";
}

function main(): void {
  const contract = parseJuliaPixelRecoveryContractV1(contractAsset);
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  const renderer = parseJuliaRendererEvidenceV2(rendererAsset);
  const oldFinal = parseJuliaFinalCapabilityCensusV1(oldFinalAsset);
  invariant(contract.ok, "julia-final-recovery-contract-invalid");
  invariant(preGpu.ok, "julia-final-recovery-pre-gpu-invalid");
  invariant(renderer.ok, "julia-final-recovery-renderer-invalid");
  invariant(oldFinal.ok, "julia-final-recovery-baseline-invalid");
  invariant(
    renderer.value.preGpuContentHash === preGpu.value.contentHash &&
      renderer.value.rowCount === preGpu.value.statusCounts.tier2Queue,
    "julia-final-recovery-renderer-binding-invalid",
  );
  invariant(
    record(roleAsset) &&
      roleAsset.rowCount === 534 &&
      roleAsset.contentHash === contentHash(roleAsset as JsonRecord) &&
      record(candidatesAsset) &&
      candidatesAsset.rowCount === 534 &&
      candidatesAsset.contentHash === contentHash(candidatesAsset as JsonRecord),
    "julia-final-recovery-input-hash-invalid",
  );
  const orderedIds = contract.value.lineage.orderedFormulaIds;
  const roleRows = roleAsset.rows as unknown as JsonRecord[];
  const candidateRows = candidatesAsset.rows as unknown as JsonRecord[];
  invariant(
    roleRows.length === 534 &&
      candidateRows.length === 534 &&
      preGpu.value.rows.length === 534 &&
      roleRows.every((row, index) => row.formulaId === orderedIds[index]) &&
      candidateRows.every((row, index) => row.formulaId === orderedIds[index]) &&
      preGpu.value.rows.every((row, index) => row.formulaId === orderedIds[index]),
    "julia-final-recovery-input-order-invalid",
  );
  const rendererById = new Map(
    renderer.value.rows.map((row) => [row.formulaId, row]),
  );
  const projectionRows: JuliaPixelRecoveryProjectionRowV1[] = [];
  for (let index = 0; index < orderedIds.length; index++) {
    const formulaId = orderedIds[index]!;
    const role = roleRows[index]!;
    const pre = preGpu.value.rows[index]!;
    const rendererRow = rendererById.get(formulaId);
    const roleMode = String(role.modeClass);
    const modeClass =
      pre.supportLane !== "none" ? "classic-julia" : roleMode;
    invariant(
      ["classic-julia", "generalized-two-plane", "undetermined"].includes(
        modeClass,
      ) &&
        Array.isArray(role.roles) &&
        typeof role.roleReceipt === "string" &&
        record(role.changedRegionReceipt) &&
        typeof role.changedRegionReceipt.analysisContentHash === "string",
      `julia-final-recovery-role-invalid:${formulaId}`,
    );
    let finalStatus: JuliaPixelRecoveryProjectionRowV1["finalStatus"];
    if (pre.status === "tier2-queue") {
      invariant(rendererRow, `julia-final-recovery-renderer-missing:${formulaId}`);
      finalStatus = rendererRow.status === "passed" ? "supported" : "blocked";
    } else if (pre.status === "held") finalStatus = "held";
    else if (pre.status === "unknown") finalStatus = "unknown";
    else finalStatus = "blocked";
    const tier2State = rendererRow
      ? rendererRow.status === "passed"
        ? "pass"
        : "fail"
      : "not-required";
    const tier2Receipt = rendererRow
      ? reference(
          sha256HexSyncV1(canonicalJsonV1(rendererRow, 64_000)),
        )
      : null;
    const classic = modeClass === "classic-julia";
    const finalRoleSet = new Set(
      (role.roles as string[]).filter(
        (candidateRole) =>
          pre.supportLane === "none" || candidateRole !== "role:unresolved",
      ),
    );
    if (pre.supportLane !== "none") finalRoleSet.add("role:pixel-seed");
    if (pre.supportLane === "source-split-direct") {
      finalRoleSet.delete("role:derived-pixel-constant");
      finalRoleSet.add("role:pixel-constant");
    }
    if (pre.supportLane === "source-split-transitive") {
      finalRoleSet.delete("role:pixel-constant");
      finalRoleSet.add("role:derived-pixel-constant");
    }
    if (pre.supportLane === "parameter-binding") {
      finalRoleSet.delete("role:pixel-constant");
      finalRoleSet.delete("role:derived-pixel-constant");
      finalRoleSet.add("role:julia-constant");
      finalRoleSet.add("role:formula-parameter");
    }
    const finalRoles = JULIA_PIXEL_RECOVERY_ROLES_V1.filter((candidateRole) =>
      finalRoleSet.has(candidateRole),
    );
    const row: JuliaPixelRecoveryProjectionRowV1 = {
      schema: "fractalpark-julia-pixel-recovery-projection-row/v1",
      formulaId,
      roles: finalRoles,
      modeClass: modeClass as JuliaPixelRecoveryProjectionRowV1["modeClass"],
      supportLane: pre.supportLane,
      remediationLane: remediationLane(
        finalStatus,
        modeClass,
        pre.reasonCodes,
        rendererRow?.status === "blocked",
      ),
      rewriteClass:
        pre.rewriteClass === null ? "none" : pre.rewriteClass,
      finalStatus,
      identityChangeProposalRef: null,
      evidence: {
        tier0: pre.tier0,
        tier1: pre.tier1,
        tier2: tier2State,
        identityReview: "not-required",
        e1Supplement: "not-required",
        e1SealedHoldout: "not-required",
        notApplicableReview: "not-required",
      },
      receipts: {
        roleDiscovery: String(role.roleReceipt),
        sourceAuthority:
          pre.candidateContentHash === null
            ? null
            : reference(pre.candidateContentHash),
        directPixelSeed: classic
          ? reference(String(role.changedRegionReceipt.analysisContentHash))
          : null,
        tier0:
          pre.tier0 === "pass" || pre.tier0 === "fail"
            ? reference(pre.rowReceipt)
            : null,
        tier1:
          pre.tier1 === "pass" || pre.tier1 === "fail"
            ? reference(pre.rowReceipt)
            : null,
        tier2: tier2Receipt,
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
    const parsed = parseJuliaPixelRecoveryProjectionRowV1(row);
    invariant(parsed.ok, `julia-final-recovery-row-invalid:${formulaId}`);
    projectionRows.push(parsed.value);
  }
  invariant(
    projectionRows.length === 534 &&
      new Set(projectionRows.map((row) => row.formulaId)).size === 534,
    "julia-final-recovery-row-set-invalid",
  );
  const finalCensus = hashContent({
    schema: JULIA_PIXEL_FINAL_CAPABILITY_CENSUS_SCHEMA_V2,
    revision: 2 as const,
    authority: {
      authorityState: "sealed" as const,
      supersededBy: null,
      withdrawnBy: null,
    },
    contractContentHash: contract.value.contentHash,
    rowCount: 534 as const,
    rows: projectionRows,
  });
  invariant(
    parseJuliaPixelFinalCapabilityCensusV2(finalCensus, contractAsset).ok,
    "julia-final-recovery-census-invalid",
  );
  const supportedIds = projectionRows
    .filter(
      (row) =>
        row.modeClass === "classic-julia" && row.finalStatus === "supported",
    )
    .map((row) => row.formulaId)
    .sort();
  const oldSupportedIds = oldFinal.value.rows
    .filter((row) => row.status === "supported")
    .map((row) => row.formulaId)
    .sort();
  const supportedSet = new Set(supportedIds);
  const oldSupportedSet = new Set(oldSupportedIds);
  const regressionIds = oldSupportedIds.filter((id) => !supportedSet.has(id));
  const gainIds = supportedIds.filter((id) => !oldSupportedSet.has(id));
  const attemptManifest = readPrivateJson(
    join(
      PRIVATE_ROOT,
      `holdout-attempt-manifest.wave-${renderer.value.waveId}.json`,
    ),
  );
  const sealedLedger = readPrivateJson(
    join(
      PRIVATE_ROOT,
      `attempt-ledger.sealed-${renderer.value.waveId}.json`,
    ),
  );
  invariant(
    attemptManifest.contentHash === contentHash(attemptManifest) &&
      attemptManifest.rowCount === 0 &&
      sealedLedger.contentHash === contentHash(sealedLedger) &&
      sealedLedger.stage === "sealed" &&
      sealedLedger.waveId === renderer.value.waveId &&
      Array.isArray(sealedLedger.attempts) &&
      sealedLedger.attempts.length === 0,
    "julia-final-recovery-attempt-state-invalid",
  );
  const inputAuthorityContentHashes = [
    contract.value.contentHash,
    String(roleAsset.contentHash),
    String(candidatesAsset.contentHash),
    preGpu.value.contentHash,
    renderer.value.contentHash,
    String(attemptManifest.contentHash),
    String(sealedLedger.contentHash),
    oldFinal.value.contentHash,
  ].sort();
  invariant(
    inputAuthorityContentHashes.every((hash) => SHA256.test(hash)) &&
      new Set(inputAuthorityContentHashes).size ===
        inputAuthorityContentHashes.length,
    "julia-final-recovery-authority-input-invalid",
  );
  const authorityManifest = hashContent({
    schema: JULIA_PIXEL_FINAL_AUTHORITY_MANIFEST_SCHEMA_V1,
    revision: 1 as const,
    authority: {
      authorityState: "sealed" as const,
      supersededBy: null,
      withdrawnBy: null,
    },
    finalCensusContentHash: finalCensus.contentHash,
    inputAuthorityContentHashes,
  });
  invariant(
    parseJuliaPixelFinalAuthorityManifestV1(authorityManifest).ok,
    "julia-final-recovery-authority-manifest-invalid",
  );
  const handoff = hashContent({
    schema: JULIA_PIXEL_ACTIVATION_HANDOFF_SCHEMA_V1,
    revision: 1 as const,
    authority: {
      authorityState: "sealed" as const,
      supersededBy: null,
      withdrawnBy: null,
    },
    handoffState: "review-pending" as const,
    finalCensusContentHash: finalCensus.contentHash,
    finalCensusAuthorityState: "sealed" as const,
    authorityManifestContentHash: authorityManifest.contentHash,
    supportedClassicRowSetDigest: sha256HexSyncV1(
      canonicalJsonV1(supportedIds, 4_096),
    ),
    supportedClassicRowCount: supportedIds.length,
    regressionSetDigest: sha256HexSyncV1(
      canonicalJsonV1(regressionIds, 4_096),
    ),
    regressionCount: regressionIds.length,
    maintainerAcknowledgmentReceiptDigest: null,
  });
  invariant(
    regressionIds.length > 0 &&
      parseJuliaPixelActivationHandoffV1(handoff).ok,
    "julia-final-recovery-handoff-invalid",
  );
  const heldIds = projectionRows
    .filter((row) => row.finalStatus === "held")
    .map((row) => row.formulaId)
    .sort();
  const generalizedHeldIds = projectionRows
    .filter(
      (row) =>
        row.finalStatus === "held" &&
        row.modeClass === "generalized-two-plane",
    )
    .map((row) => row.formulaId)
    .sort();
  const blockedIds = projectionRows
    .filter((row) => row.finalStatus === "blocked")
    .map((row) => row.formulaId)
    .sort();
  const unknownIds = projectionRows
    .filter((row) => row.finalStatus === "unknown")
    .map((row) => row.formulaId)
    .sort();
  const notApplicableIds = projectionRows
    .filter((row) => row.finalStatus === "not-applicable")
    .map((row) => row.formulaId)
    .sort();
  const identityChangeProposalRefs = projectionRows
    .flatMap((row) =>
      row.identityChangeProposalRef === null
        ? []
        : [row.identityChangeProposalRef.slice(7)],
    )
    .sort();
  const historicalCorpusDigests = [
    ...contract.value.holdoutContract.historicalCorpusDigests,
    String(sealedLedger.currentCorpusDigest),
  ].sort();
  const audit = hashContent({
    schema: JULIA_FINAL_RECOVERY_AUDIT_SCHEMA_V1,
    revision: 1 as const,
    authority: {
      authorityState: "sealed" as const,
      supersededBy: null,
      withdrawnBy: null,
    },
    contractContentHash: contract.value.contentHash,
    roleCensusContentHash: String(roleAsset.contentHash),
    recoveryCandidatesContentHash: String(candidatesAsset.contentHash),
    preGpuContentHash: preGpu.value.contentHash,
    rendererEvidenceContentHash: renderer.value.contentHash,
    holdoutAttemptManifestContentHash: String(attemptManifest.contentHash),
    sealedAttemptLedgerContentHash: String(sealedLedger.contentHash),
    finalCensusContentHash: finalCensus.contentHash,
    authorityManifestContentHash: authorityManifest.contentHash,
    activationHandoffContentHash: handoff.contentHash,
    currentWaveId: renderer.value.waveId,
    historicalCorpusDigests,
    statusCounts: {
      supported: supportedIds.length,
      held: heldIds.length,
      blocked: blockedIds.length,
      unknown: unknownIds.length,
      notApplicable: notApplicableIds.length,
    },
    supportedClassicIds: supportedIds,
    heldIds,
    generalizedHeldIds,
    blockedIds,
    unknownIds,
    notApplicableIds,
    identityChangeProposalRefs,
    regressionIds,
    gainIds,
    sealedAttemptCounts: orderedIds.map((formulaId) => ({
      formulaId,
      historicalSealedAttemptCount: 0,
      currentWaveSealedAttemptCount: 0,
      cumulativeSealedAttemptCount: 0,
    })),
    sourceBindings: sourceBindings(),
  });
  invariant(
    parseJuliaFinalRecoveryAuditV1(audit).ok,
    "julia-final-recovery-audit-invalid",
  );
  const artifacts = [
    [OUTPUTS.census, finalCensus],
    [OUTPUTS.authority, authorityManifest],
    [OUTPUTS.handoff, handoff],
    [OUTPUTS.audit, audit],
  ] as const;
  for (const [path, artifact] of artifacts) {
    const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
    if (process.argv.includes("--write")) {
      const temporary = `${path}.tmp-${process.pid}`;
      writeFileSync(temporary, serialized, { mode: 0o644 });
      renameSync(temporary, path);
    } else {
      invariant(
        readFileSync(path, "utf8") === serialized,
        `julia-final-recovery-drift:${path}`,
      );
    }
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      write: process.argv.includes("--write"),
      rowCount: projectionRows.length,
      supported: supportedIds.length,
      held: heldIds.length,
      blocked: blockedIds.length,
      unknown: unknownIds.length,
      regressions: regressionIds.length,
      gains: gainIds.length,
      handoffState: handoff.handoffState,
      finalCensusContentHash: finalCensus.contentHash,
      auditContentHash: audit.contentHash,
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
        error instanceof Error ? error.message : "julia-final-recovery-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
