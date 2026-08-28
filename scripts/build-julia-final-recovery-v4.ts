import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import baselineAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import predecessorAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v3.json";
import predecessorAuditAsset from "../resources/formula-library/v1/julia-pixel-final-recovery-audit.v2.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import adjudicationAsset from "../resources/formula-library/v1/julia-mutable-state-adjudication.v1.json";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  parseJuliaFinalRecoveryAuditV2,
  parseJuliaPixelFinalCapabilityCensusV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v3";
import {
  JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  juliaFinalRecoveryV4ContentHash,
  parseJuliaFinalRecoveryAuditV3,
  parseJuliaPixelActivationHandoffV3,
  parseJuliaPixelFinalAuthorityManifestV3,
  parseJuliaPixelFinalCapabilityCensusV4,
} from "../src/engine/formulas/v1/julia-final-recovery-v4";
import { parseJuliaMutableStateAdjudicationV1 } from "../src/engine/formulas/v1/julia-mutable-state-adjudication-v1";
import {
  parseJuliaPixelRecoveryContractV1,
  parseJuliaPixelRecoveryProjectionRowV1,
} from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

type Json = Record<string, unknown>;
const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const SEALED = {
  authorityState: "sealed" as const,
  supersededBy: null,
  withdrawnBy: null,
};
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
const ref = (digest: string) => `sha256:${digest}`;
const seal = (body: Json): Json => ({
  ...body,
  contentHash: juliaFinalRecoveryV4ContentHash(body),
});
const canonical = (value: unknown, budget = 1_048_576) =>
  canonicalJsonV1(value, budget);
const same = (left: unknown, right: unknown) =>
  canonical(left) === canonical(right);

function sourceBindings(): Json {
  return Object.fromEntries(
    JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS.map((path) => [
      path,
      sha256HexSyncV1(readFileSync(join(ROOT, path), "utf8")),
    ]),
  );
}
function atomicWrite(path: string, value: Json): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error(`unsafe-output:${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
    flag: "wx",
  });
  renameSync(temporary, path);
}

function main(): void {
  const baseline = parseJuliaFinalCapabilityCensusV1(baselineAsset);
  const predecessor = parseJuliaPixelFinalCapabilityCensusV3(predecessorAsset);
  const predecessorAudit = parseJuliaFinalRecoveryAuditV2(predecessorAuditAsset);
  const contract = parseJuliaPixelRecoveryContractV1(contractAsset);
  const adjudication = parseJuliaMutableStateAdjudicationV1(adjudicationAsset);
  if (!baseline.ok || !predecessor.ok || !predecessorAudit.ok ||
    !contract.ok || !adjudication.ok) throw new Error("v4-upstream-parse-invalid");
  const adjudications = new Map(
    adjudication.value.rows.map((row) => [row.formulaId, row]),
  );
  const eligible = predecessor.value.rows.filter((row) =>
    row.modeClass === "undetermined" && row.finalStatus === "held" &&
    row.supportLane === "none" && row.remediationLane === "mutable-state-separation",
  ).map((row) => row.formulaId).sort();
  const predecessorRegressions = predecessorAudit.value.regressionIds as string[];
  const targets = eligible.filter((id) =>
    adjudications.has(id) && predecessorRegressions.includes(id),
  );
  if (!same(targets, adjudication.value.rows.map((row) => row.formulaId).sort()) ||
    targets.length !== 9) throw new Error("v4-target-derivation-invalid");
  const targetSet = new Set(targets);
  const rows = predecessor.value.rows.map((old) => {
    if (!targetSet.has(old.formulaId)) return old;
    const correction = adjudications.get(old.formulaId)!;
    const roles = old.roles
      .filter((role) => role !== "role:unresolved")
      .sort((left, right) => ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right));
    const row = {
      ...old,
      roles,
      modeClass: "classic-julia" as const,
      supportLane: "state-separated" as const,
      remediationLane: "none" as const,
      rewriteClass: "E0-operational-equivalence" as const,
      finalStatus: "supported" as const,
      identityChangeProposalRef: null,
      evidence: {
        tier0: "pass" as const,
        tier1: "pass" as const,
        tier2: "pass" as const,
        identityReview: "not-required" as const,
        e1Supplement: "not-required" as const,
        e1SealedHoldout: "not-required" as const,
        notApplicableReview: "not-required" as const,
      },
      receipts: {
        ...old.receipts,
        sourceAuthority: ref(correction.candidateSourceRevision),
        roleDiscovery: ref(correction.rowReceipt),
        directPixelSeed: ref(correction.rowReceipt),
        tier0: ref(correction.rowReceipt),
        tier1: ref(correction.rowReceipt),
        tier2: ref(correction.rendererTupleReceipt),
        identityReview: null,
        e1Supplement: null,
        e1SealedHoldout: null,
        notApplicableReview: null,
      },
      authority: SEALED,
    };
    if (!parseJuliaPixelRecoveryProjectionRowV1(row).ok)
      throw new Error(`v4-row-invalid:${old.formulaId}`);
    return row;
  });
  const census = seal({
    schema: "fractalpark-julia-pixel-final-capability-census/v4",
    revision: 4,
    authority: SEALED,
    contractContentHash: contract.value.contentHash,
    predecessorContentHash: predecessor.value.contentHash,
    adjudicationContentHash: adjudication.value.contentHash,
    rowCount: 534,
    rows,
  });
  const status = (name: string) => rows
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
  const counts = [
    supported.length,
    held.length,
    blocked.length,
    unknown.length,
    notApplicable.length,
    gains.length,
    regressions.length,
    targets.length,
    cumulativeRecovered.length,
  ];
  if (!same(counts, [195, 151, 72, 116, 0, 36, 11, 9, 16]))
    throw new Error("v4-count-invalid");
  const bindingMap = sourceBindings();
  const authority = seal({
    schema: "fractalpark-julia-pixel-final-authority-manifest/v3",
    revision: 3,
    authority: SEALED,
    finalCensusContentHash: census.contentHash,
    inputAuthorityContentHashes: [
      baseline.value.contentHash,
      predecessor.value.contentHash,
      predecessorAudit.value.contentHash,
      contract.value.contentHash,
      adjudication.value.contentHash,
    ].sort(),
    sourceBindings: bindingMap,
  });
  const handoff = seal({
    schema: "fractalpark-julia-pixel-activation-handoff/v3",
    revision: 3,
    authority: SEALED,
    handoffState: "review-pending",
    finalCensusContentHash: census.contentHash,
    authorityManifestContentHash: authority.contentHash,
    supportedClassicRowSetDigest: sha256HexSyncV1(canonical(supported, 16_384)),
    supportedClassicRowCount: supported.length,
    regressionSetDigest: sha256HexSyncV1(canonical(regressions, 4096)),
    regressionCount: regressions.length,
    maintainerAcknowledgmentReceiptDigest: null,
  });
  const audit = seal({
    schema: "fractalpark-julia-pixel-final-recovery-audit/v3",
    revision: 3,
    authority: SEALED,
    baselineContentHash: baseline.value.contentHash,
    predecessorContentHash: predecessor.value.contentHash,
    predecessorAuditContentHash: predecessorAudit.value.contentHash,
    contractContentHash: contract.value.contentHash,
    adjudicationContentHash: adjudication.value.contentHash,
    finalCensusContentHash: census.contentHash,
    authorityManifestContentHash: authority.contentHash,
    activationHandoffContentHash: handoff.contentHash,
    statusCounts: {
      supported: supported.length,
      held: held.length,
      blocked: blocked.length,
      unknown: unknown.length,
      notApplicable: notApplicable.length,
    },
    supportedClassicIds: supported,
    heldIds: held,
    blockedIds: blocked,
    unknownIds: unknown,
    notApplicableIds: notApplicable,
    gainIds: gains,
    regressionIds: regressions,
    recoveredRegressionIds: targets,
    cumulativeRecoveredRegressionIds: cumulativeRecovered,
    sourceBindings: bindingMap,
  });
  if (!parseJuliaPixelFinalCapabilityCensusV4(census).ok ||
    !parseJuliaPixelFinalAuthorityManifestV3(authority).ok ||
    !parseJuliaPixelActivationHandoffV3(handoff).ok ||
    !parseJuliaFinalRecoveryAuditV3(audit).ok) {
    throw new Error("v4-output-parse-invalid");
  }
  atomicWrite(
    join(RESOURCE, "julia-pixel-final-capability-census.v4.json"),
    census,
  );
  atomicWrite(
    join(RESOURCE, "julia-pixel-final-authority-manifest.v3.json"),
    authority,
  );
  atomicWrite(
    join(RESOURCE, "julia-pixel-activation-handoff.v3.json"),
    handoff,
  );
  atomicWrite(
    join(RESOURCE, "julia-pixel-final-recovery-audit.v3.json"),
    audit,
  );
}

main();
