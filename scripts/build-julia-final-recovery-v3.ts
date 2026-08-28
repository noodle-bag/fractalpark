import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import baselineAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import predecessorAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v2.json";
import predecessorAuditAsset from "../resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import correctiveAsset from "../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import rendererAsset from "../resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import { parseJuliaFinalRecoveryAuditV1 } from "../src/engine/formulas/v1/julia-final-recovery-v2";
import { parseJuliaClassicRegressionCorrectiveV1 } from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import { parseJuliaClassicRegressionRendererEvidenceV1 } from "../src/engine/formulas/v1/julia-classic-regression-renderer-closure-v1";
import { parseJuliaPixelFinalCapabilityCensusV2, parseJuliaPixelRecoveryContractV1, parseJuliaPixelRecoveryProjectionRowV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS, juliaFinalRecoveryV3ContentHash, parseJuliaFinalRecoveryAuditV2, parseJuliaPixelActivationHandoffV2, parseJuliaPixelFinalAuthorityManifestV2, parseJuliaPixelFinalCapabilityCensusV3 } from "../src/engine/formulas/v1/julia-final-recovery-v3";

type Json = Record<string, unknown>;
const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const SEALED = { authorityState: "sealed", supersededBy: null, withdrawnBy: null };
const ROLE_ORDER = ["role:pixel-seed", "role:pixel-constant", "role:julia-constant", "role:derived-pixel-constant", "role:formula-parameter", "role:dynamic-orbit-state", "role:bailout-control", "role:unresolved"];
const ref = (digest: string) => `sha256:${digest}`;
const seal = (body: Json): Json => ({ ...body, contentHash: juliaFinalRecoveryV3ContentHash(body) });
const canonical = (value: unknown, budget = 1_048_576) => canonicalJsonV1(value, budget);
const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);

function sourceBindings(): Json {
  return Object.fromEntries(JULIA_FINAL_RECOVERY_V3_SOURCE_BINDING_PATHS.map((path) => [path, sha256HexSyncV1(readFileSync(join(ROOT, path), "utf8"))]));
}
function atomicWrite(path: string, value: Json): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  try { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error(`unsafe-output:${path}`); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o644, flag: "wx" });
  renameSync(temporary, path);
}
function main(): void {
  const baseline = parseJuliaFinalCapabilityCensusV1(baselineAsset); const contract = parseJuliaPixelRecoveryContractV1(contractAsset); const predecessor = parseJuliaPixelFinalCapabilityCensusV2(predecessorAsset, contractAsset); const predecessorAudit = parseJuliaFinalRecoveryAuditV1(predecessorAuditAsset); const corrective = parseJuliaClassicRegressionCorrectiveV1(correctiveAsset); const renderer = parseJuliaClassicRegressionRendererEvidenceV1(rendererAsset);
  if (!baseline.ok || !contract.ok || !predecessor.ok || !predecessorAudit.ok || !corrective.ok || !renderer.ok) throw new Error("v3-upstream-parse-invalid");
  const corrections = new Map(corrective.value.rows.map((row) => [row.formulaId, row])); const evidence = new Map(renderer.value.rows.filter((row) => row.status === "passed").map((row) => [row.formulaId, row]));
  const eligible = predecessor.value.rows.filter((row) => row.modeClass === "classic-julia" && row.finalStatus === "held" && row.supportLane === "none" && row.remediationLane === "canonical-rebind").map((row) => row.formulaId).sort();
  const targets = eligible.filter((id) => corrections.has(id) && evidence.has(id) && predecessorAudit.value.regressionIds.includes(id));
  if (!same(targets, corrective.value.rows.map((row) => row.formulaId).sort()) || !same(targets, [...evidence.keys()].sort()) || targets.some((id) => !predecessorAudit.value.regressionIds.includes(id)) || targets.length !== 7) throw new Error("v3-target-derivation-invalid");
  const targetSet = new Set(targets);
  const rows = predecessor.value.rows.map((old) => {
    if (!targetSet.has(old.formulaId)) return old;
    const correction = corrections.get(old.formulaId)!; const rendererRow = evidence.get(old.formulaId)!; const requiredRole = correction.supportLane === "source-split-direct" ? "role:pixel-constant" : "role:derived-pixel-constant";
    const roles = [...new Set([...old.roles.filter((role) => role !== "role:pixel-constant" && role !== "role:derived-pixel-constant"), requiredRole])].sort((left, right) => ROLE_ORDER.indexOf(left) - ROLE_ORDER.indexOf(right));
    const row = { ...old, roles, supportLane: correction.supportLane, remediationLane: "none" as const, rewriteClass: "E0-operational-equivalence" as const, finalStatus: "supported" as const, identityChangeProposalRef: null, evidence: { tier0: "pass" as const, tier1: "pass" as const, tier2: "pass" as const, identityReview: "not-required" as const, e1Supplement: "not-required" as const, e1SealedHoldout: "not-required" as const, notApplicableReview: "not-required" as const }, receipts: { ...old.receipts, sourceAuthority: ref(correction.candidateSourceRevision), directPixelSeed: ref(correction.e0.analysisContentHash), tier0: ref(correction.rowReceipt), tier1: ref(correction.rowReceipt), tier2: ref(rendererRow.receipt), identityReview: null, e1Supplement: null, e1SealedHoldout: null, notApplicableReview: null }, authority: SEALED };
    if (!parseJuliaPixelRecoveryProjectionRowV1(row).ok) throw new Error(`v3-row-invalid:${old.formulaId}`);
    return row;
  });
  const census = seal({ schema: "fractalpark-julia-pixel-final-capability-census/v3", revision: 3, authority: SEALED, contractContentHash: contract.value.contentHash, predecessorContentHash: predecessor.value.contentHash, correctiveContentHash: corrective.value.contentHash, rendererEvidenceContentHash: renderer.value.contentHash, rowCount: 534, rows });
  const status = (name: string) => rows.filter((row) => row.finalStatus === name).map((row) => row.formulaId).sort(); const supported = status("supported"); const held = status("held"); const blocked = status("blocked"); const unknown = status("unknown"); const notApplicable = status("not-applicable"); const baselineSupported = baseline.value.rows.filter((row) => row.status === "supported").map((row) => row.formulaId).sort(); const gains = supported.filter((id) => !baselineSupported.includes(id)); const regressions = baselineSupported.filter((id) => !supported.includes(id));
  if (![supported.length, held.length, blocked.length, unknown.length, notApplicable.length, gains.length, regressions.length].every((count, index) => count === [186, 160, 72, 116, 0, 36, 20][index])) throw new Error("v3-count-invalid");
  const bindingMap = sourceBindings(); const authority = seal({ schema: "fractalpark-julia-pixel-final-authority-manifest/v2", revision: 2, authority: SEALED, finalCensusContentHash: census.contentHash, inputAuthorityContentHashes: [baseline.value.contentHash, predecessor.value.contentHash, contract.value.contentHash, corrective.value.contentHash, renderer.value.contentHash].sort(), sourceBindings: bindingMap });
  const handoff = seal({ schema: "fractalpark-julia-pixel-activation-handoff/v2", revision: 2, authority: SEALED, handoffState: "review-pending", finalCensusContentHash: census.contentHash, authorityManifestContentHash: authority.contentHash, supportedClassicRowSetDigest: sha256HexSyncV1(canonical(supported, 4096)), supportedClassicRowCount: supported.length, regressionSetDigest: sha256HexSyncV1(canonical(regressions, 4096)), regressionCount: regressions.length, maintainerAcknowledgmentReceiptDigest: null });
  const audit = seal({ schema: "fractalpark-julia-pixel-final-recovery-audit/v2", revision: 2, authority: SEALED, baselineContentHash: baseline.value.contentHash, predecessorContentHash: predecessor.value.contentHash, contractContentHash: contract.value.contentHash, correctiveContentHash: corrective.value.contentHash, rendererEvidenceContentHash: renderer.value.contentHash, finalCensusContentHash: census.contentHash, authorityManifestContentHash: authority.contentHash, activationHandoffContentHash: handoff.contentHash, statusCounts: { supported: supported.length, held: held.length, blocked: blocked.length, unknown: unknown.length, notApplicable: notApplicable.length }, supportedClassicIds: supported, heldIds: held, blockedIds: blocked, unknownIds: unknown, notApplicableIds: notApplicable, gainIds: gains, regressionIds: regressions, recoveredRegressionIds: targets, sourceBindings: bindingMap });
  if (!parseJuliaPixelFinalCapabilityCensusV3(census).ok || !parseJuliaPixelFinalAuthorityManifestV2(authority).ok || !parseJuliaPixelActivationHandoffV2(handoff).ok || !parseJuliaFinalRecoveryAuditV2(audit).ok) throw new Error("v3-output-parse-invalid");
  atomicWrite(join(RESOURCE, "julia-pixel-final-capability-census.v3.json"), census); atomicWrite(join(RESOURCE, "julia-pixel-final-authority-manifest.v2.json"), authority); atomicWrite(join(RESOURCE, "julia-pixel-activation-handoff.v2.json"), handoff); atomicWrite(join(RESOURCE, "julia-pixel-final-recovery-audit.v2.json"), audit);
}
main();
