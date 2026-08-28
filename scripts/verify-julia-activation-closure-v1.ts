import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import baselineAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import predecessorCensusAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v3.json";
import predecessorAuditAsset from "../resources/formula-library/v1/julia-pixel-final-recovery-audit.v2.json";
import adjudicationAsset from "../resources/formula-library/v1/julia-mutable-state-adjudication.v1.json";
import censusAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v4.json";
import predecessorAuthorityAsset from "../resources/formula-library/v1/julia-pixel-final-authority-manifest.v3.json";
import predecessorHandoffAsset from "../resources/formula-library/v1/julia-pixel-activation-handoff.v3.json";
import finalAuditAsset from "../resources/formula-library/v1/julia-pixel-final-recovery-audit.v3.json";
import acknowledgmentAsset from "../resources/formula-library/v1/julia-pixel-maintainer-acknowledgment.v1.json";
import successorAuthorityAsset from "../resources/formula-library/v1/julia-pixel-final-authority-manifest.v4.json";
import successorHandoffAsset from "../resources/formula-library/v1/julia-pixel-activation-handoff.v4.json";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  parseJuliaFinalRecoveryAuditV3,
  parseJuliaPixelActivationHandoffV3,
  parseJuliaPixelFinalAuthorityManifestV3,
  parseJuliaPixelFinalCapabilityCensusV4,
  verifyJuliaFinalRecoveryActivationHandoffV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v4";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

const root = process.cwd();
const sourcePaths = Object.freeze([
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
const pinnedPredecessorSha256 = Object.freeze({
  "resources/formula-library/v1/julia-pixel-final-capability-census.v4.json":
    "b66df89bbdd5b1d0a6ed53ff5c1cb023d38ce03fec6dce80c5a2ba673eaaa52a",
  "resources/formula-library/v1/julia-pixel-final-authority-manifest.v3.json":
    "e1b3fde7677a359d8159ae9dc2ed494ea238397dc604dc14f5ae248ad4a35930",
  "resources/formula-library/v1/julia-pixel-activation-handoff.v3.json":
    "ac4d4b788fccba92f1b0904f52dd1f2c1acb18163a3881a86281532b3b5edc15",
  "resources/formula-library/v1/julia-pixel-final-recovery-audit.v3.json":
    "5c5f0b8679708b75f54313f2cef495e8e3807201a5b21682bf605b8f74c38296",
  "src/engine/formulas/v1/julia-final-recovery-v4.ts":
    "e93a570b806bb9316b56d1fd734dcb9344af75ae23d4f6536276e015e6da7f4f",
} as const);
const allows = Object.freeze([
  "seal and commit/push the v0.4.19 acknowledgment closure within Draft PR #20",
  "make only the exact-195 supported classic rows activation-eligible for a separately authorized 29h",
] as const);
const doesNotAllow = Object.freeze([
  "mutate the sealed final v4 census or any formula, source, profile, renderer, or evidence row",
  "promote or conceal any exact-11 residual row",
  "execute 29h or wire runtime/UI activation",
  "mark the pull request ready, merge, or auto-merge",
  "deploy or promote Production, run migrations, create a tag or Release, or submit IndexNow",
] as const);
const trustModel = Object.freeze({
  authorityRoot: "repository-governed-human-maintainer-decision",
  identityAssurance: "approval-observed-in-authenticated-project-session",
  cryptographicSignature: "not-provided-by-project-policy",
  threatBoundary:
    "detects stale or substituted receipt bytes; repository-maintainer compromise is out of scope",
} as const);
const consumerPredicate =
  "modeClass=classic-julia AND finalStatus=supported AND requiredReceipts=pass";
const SHA = /^[a-f0-9]{64}$/;
type RecordValue = Record<string, unknown>;

function fail(code: string): never {
  throw new Error(code);
}
function assert(value: unknown, code: string): asserts value {
  if (!value) fail(code);
}
function plain(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: RecordValue, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key) => typeof key === "string") &&
    (actual as string[]).sort().every((key, index) => key === expected[index]);
}
function dense(value: readonly unknown[]): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}
function same(left: unknown, right: unknown, budget = 1_048_576): boolean {
  return canonicalJsonV1(left, budget) === canonicalJsonV1(right, budget);
}
function hash(value: unknown): value is string {
  return typeof value === "string" && SHA.test(value);
}
function contentHash(value: RecordValue): string {
  return sha256HexSyncV1(canonicalJsonV1(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== "contentHash")),
    1_048_576,
  ));
}
function seal(value: unknown): boolean {
  return plain(value) && exact(value, [
    "authorityState", "supersededBy", "withdrawnBy",
  ]) && value.authorityState === "sealed" && value.supersededBy === null &&
    value.withdrawnBy === null;
}
function text(path: string): string {
  const absolute = join(root, path);
  const stats = lstatSync(absolute);
  assert(stats.isFile() && !stats.isSymbolicLink() && stats.nlink === 1, `not-file:${path}`);
  return readFileSync(absolute, "utf8");
}
function sourceContents(paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(paths.map((path) => [path, text(path)]));
}
function assertSelfHash(value: RecordValue, code: string): void {
  assert(hash(value.contentHash) && value.contentHash === contentHash(value), code);
}

function main(): void {
  for (const [path, digest] of Object.entries(pinnedPredecessorSha256)) {
    assert(sha256HexSyncV1(text(path)) === digest, `predecessor-byte-pin:${path}`);
  }
  const predecessor = verifyJuliaFinalRecoveryActivationHandoffV3(
    predecessorHandoffAsset,
    censusAsset,
    predecessorAuthorityAsset,
    finalAuditAsset,
    baselineAsset,
    predecessorCensusAsset,
    contractAsset,
    predecessorAuditAsset,
    adjudicationAsset,
    sourceContents(JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS),
  );
  assert(predecessor.code === "julia-final-recovery-v4-review-pending", "predecessor");

  const baseline = parseJuliaFinalCapabilityCensusV1(baselineAsset);
  const census = parseJuliaPixelFinalCapabilityCensusV4(censusAsset);
  const predecessorAuthority = parseJuliaPixelFinalAuthorityManifestV3(predecessorAuthorityAsset);
  const predecessorHandoff = parseJuliaPixelActivationHandoffV3(predecessorHandoffAsset);
  const finalAudit = parseJuliaFinalRecoveryAuditV3(finalAuditAsset);
  assert(baseline.ok && census.ok && predecessorAuthority.ok && predecessorHandoff.ok &&
    finalAudit.ok, "predecessor-parser");
  const baselineSnapshot = baseline.value;
  const censusSnapshot = census.value;
  const predecessorAuthoritySnapshot = predecessorAuthority.value;
  const predecessorHandoffSnapshot = predecessorHandoff.value;
  const finalAuditSnapshot = finalAudit.value;

  const supported = censusSnapshot.rows.filter((row) =>
    row.modeClass === "classic-julia" && row.finalStatus === "supported"
  ).map((row) => row.formulaId).sort();
  const supportedSet = new Set(supported);
  const baselineSupported = baselineSnapshot.rows.filter((row) => row.status === "supported")
    .map((row) => row.formulaId).sort();
  const regressions = baselineSupported.filter((formulaId) => !supportedSet.has(formulaId));
  const supportedDigest = sha256HexSyncV1(canonicalJsonV1(supported, 1_048_576));
  const regressionDigest = sha256HexSyncV1(canonicalJsonV1(regressions, 1_048_576));
  const rowById = new Map(censusSnapshot.rows.map((row) => [row.formulaId, row]));
  const acceptedResidualRows = regressions.map((formulaId) => {
    const row = rowById.get(formulaId);
    assert(row !== undefined, `missing-residual:${formulaId}`);
    return {
      formulaId,
      modeClass: row.modeClass,
      finalStatus: row.finalStatus,
      remediationLane: row.remediationLane,
    };
  });
  assert(supported.length === 195 && regressions.length === 11, "partition-count");
  assert(same(finalAuditSnapshot.supportedClassicIds, supported) &&
    same(finalAuditSnapshot.regressionIds, regressions), "audit-partition");
  const summary = acceptedResidualRows.reduce((value, row) => {
    if (row.modeClass === "generalized-two-plane") value.generalizedTwoPlane += 1;
    else if (row.modeClass === "undetermined") value.identityReview += 1;
    else if (row.modeClass === "classic-julia") value.rendererFailure += 1;
    if (row.finalStatus === "held") value.held += 1;
    else if (row.finalStatus === "blocked") value.blocked += 1;
    return value;
  }, { generalizedTwoPlane: 0, identityReview: 0, rendererFailure: 0, held: 0, blocked: 0 });
  assert(same(summary, {
    generalizedTwoPlane: 8,
    identityReview: 1,
    rendererFailure: 2,
    held: 9,
    blocked: 2,
  }), "residual-summary");

  assert(plain(acknowledgmentAsset), "ack-object");
  const acknowledgment = acknowledgmentAsset as RecordValue;
  assert(exact(acknowledgment, [
    "schema", "revision", "authority", "status", "approvedAt", "actorId",
    "actorKind", "actorRole", "decision", "targetVersion", "finalCensusContentHash",
    "predecessorAuthorityManifestContentHash", "predecessorHandoffContentHash",
    "predecessorAuditContentHash", "supportedClassicRowSetDigest",
    "supportedClassicRowCount", "regressionSetDigest", "regressionCount",
    "acceptedResidualRows", "approvalStatement", "residualDispositionResponse",
    "maintainerResponse", "trustModel", "aiAssistanceDisclosure", "scope", "contentHash",
  ]) && acknowledgment.schema === "fractalpark-julia-pixel-maintainer-acknowledgment/v1" &&
    acknowledgment.revision === 1 && seal(acknowledgment.authority) &&
    acknowledgment.status === "maintainer-approved" &&
    acknowledgment.approvedAt === "2026-08-28T18:47:11+08:00" &&
    acknowledgment.actorId === "fractalpark-maintainer" &&
    acknowledgment.actorKind === "human-maintainer" && acknowledgment.actorRole === "maintainer" &&
    acknowledgment.decision === "accept-v0.4.19-residual-boundary" &&
    acknowledgment.targetVersion === "0.4.19", "ack-contract");
  assert(acknowledgment.finalCensusContentHash === censusSnapshot.contentHash &&
    acknowledgment.predecessorAuthorityManifestContentHash ===
      predecessorAuthoritySnapshot.contentHash &&
    acknowledgment.predecessorHandoffContentHash === predecessorHandoffSnapshot.contentHash &&
    acknowledgment.predecessorAuditContentHash === finalAuditSnapshot.contentHash &&
    acknowledgment.supportedClassicRowSetDigest === supportedDigest &&
    acknowledgment.supportedClassicRowCount === supported.length &&
    acknowledgment.regressionSetDigest === regressionDigest &&
    acknowledgment.regressionCount === regressions.length &&
    same(acknowledgment.acceptedResidualRows, acceptedResidualRows), "ack-lineage");
  assert(acknowledgment.approvalStatement ===
    "接受 final v4 中 exact-11 residual 在 v0.4.19 保持 held/blocked；允许生成 activation-eligible handoff 供后续单独授权的 29h 使用；不改变 final census、不恢复 residual、不执行 29h 或任何外部发布动作。" &&
    acknowledgment.residualDispositionResponse === "不弄了，跳过这11个" &&
    acknowledgment.maintainerResponse === "确认路线一，并启动 handoff closure" &&
    same(acknowledgment.trustModel, trustModel) &&
    acknowledgment.aiAssistanceDisclosure ===
      "This acknowledgment receipt and its machine closure were drafted with AI assistance by Ellie; the residual disposition, route selection, and permission to start this closure were explicitly approved by the human maintainer.",
  "ack-decision");
  assert(plain(acknowledgment.scope) && exact(acknowledgment.scope, ["allows", "doesNotAllow"]) &&
    Array.isArray(acknowledgment.scope.allows) && dense(acknowledgment.scope.allows) &&
    Array.isArray(acknowledgment.scope.doesNotAllow) && dense(acknowledgment.scope.doesNotAllow) &&
    same(acknowledgment.scope.allows, allows) &&
    same(acknowledgment.scope.doesNotAllow, doesNotAllow), "ack-scope");
  assertSelfHash(acknowledgment, "ack-self-hash");

  assert(plain(successorAuthorityAsset), "authority-object");
  const authority = successorAuthorityAsset as RecordValue;
  assert(exact(authority, [
    "schema", "revision", "authority", "finalCensusContentHash",
    "predecessorAuthorityManifestContentHash", "predecessorHandoffContentHash",
    "predecessorAuditContentHash", "maintainerAcknowledgmentReceiptContentHash",
    "inputAuthorityContentHashes", "sourceBindings", "contentHash",
  ]) && authority.schema === "fractalpark-julia-pixel-final-authority-manifest/v4" &&
    authority.revision === 4 && seal(authority.authority), "authority-contract");
  const expectedInputs = [
    (contractAsset as RecordValue).contentHash,
    predecessorAuthoritySnapshot.contentHash,
    predecessorHandoffSnapshot.contentHash,
    finalAuditSnapshot.contentHash,
    acknowledgment.contentHash,
  ].sort();
  assert(authority.finalCensusContentHash === censusSnapshot.contentHash &&
    authority.predecessorAuthorityManifestContentHash === predecessorAuthoritySnapshot.contentHash &&
    authority.predecessorHandoffContentHash === predecessorHandoffSnapshot.contentHash &&
    authority.predecessorAuditContentHash === finalAuditSnapshot.contentHash &&
    authority.maintainerAcknowledgmentReceiptContentHash === acknowledgment.contentHash &&
    Array.isArray(authority.inputAuthorityContentHashes) &&
    dense(authority.inputAuthorityContentHashes) &&
    same(authority.inputAuthorityContentHashes, expectedInputs), "authority-lineage");
  const expectedBindings = Object.fromEntries(sourcePaths.map((path) => [
    path,
    sha256HexSyncV1(text(path)),
  ]));
  assert(plain(authority.sourceBindings) && exact(authority.sourceBindings, sourcePaths) &&
    same(authority.sourceBindings, expectedBindings), "authority-source-bindings");
  assertSelfHash(authority, "authority-self-hash");

  assert(plain(successorHandoffAsset), "handoff-object");
  const handoff = successorHandoffAsset as RecordValue;
  assert(exact(handoff, [
    "schema", "revision", "authority", "handoffState", "finalCensusContentHash",
    "finalCensusAuthorityState", "authorityManifestContentHash",
    "predecessorHandoffContentHash", "supportedClassicRowSetDigest",
    "supportedClassicRowCount", "regressionSetDigest", "regressionCount",
    "maintainerAcknowledgmentReceiptDigest", "consumerRowPredicate", "contentHash",
  ]) && handoff.schema === "fractalpark-julia-pixel-activation-handoff/v4" &&
    handoff.revision === 4 && seal(handoff.authority) &&
    handoff.handoffState === "activation-eligible" &&
    handoff.finalCensusAuthorityState === "sealed", "handoff-contract");
  assert(handoff.finalCensusContentHash === censusSnapshot.contentHash &&
    handoff.authorityManifestContentHash === authority.contentHash &&
    handoff.predecessorHandoffContentHash === predecessorHandoffSnapshot.contentHash &&
    handoff.supportedClassicRowSetDigest === supportedDigest &&
    handoff.supportedClassicRowCount === supported.length &&
    handoff.regressionSetDigest === regressionDigest &&
    handoff.regressionCount === regressions.length &&
    handoff.maintainerAcknowledgmentReceiptDigest === acknowledgment.contentHash &&
    handoff.consumerRowPredicate === consumerPredicate, "handoff-lineage");
  assertSelfHash(handoff, "handoff-self-hash");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    verifierImportsClosureModule: false,
    trustModel: "repository-governed-no-custom-pki",
    handoff: "activation-eligible",
    supportedClassic: supported.length,
    acceptedResiduals: regressions.length,
    residualSummary: summary,
    censusUnchanged: true,
    runtimeActivationExecuted: false,
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "unknown-error"}\n`);
  process.exitCode = 1;
}
