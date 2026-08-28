import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import baselineAsset from "../resources/formula-library/v1/julia-final-capability-census.v1.json";
import predecessorCensusAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v3.json";
import predecessorAuditAsset from "../resources/formula-library/v1/julia-pixel-final-recovery-audit.v2.json";
import contractAsset from "../resources/formula-library/v1/julia-pixel-recovery-contract.v1.json";
import adjudicationAsset from "../resources/formula-library/v1/julia-mutable-state-adjudication.v1.json";
import censusAsset from "../resources/formula-library/v1/julia-pixel-final-capability-census.v4.json";
import predecessorAuthorityAsset from "../resources/formula-library/v1/julia-pixel-final-authority-manifest.v3.json";
import predecessorHandoffAsset from "../resources/formula-library/v1/julia-pixel-activation-handoff.v3.json";
import finalAuditAsset from "../resources/formula-library/v1/julia-pixel-final-recovery-audit.v3.json";
import acknowledgmentAsset from "../resources/formula-library/v1/julia-pixel-maintainer-acknowledgment.v1.json";
import {
  JULIA_ACTIVATION_CLOSURE_AUTHORITY_SCHEMA_V4,
  JULIA_ACTIVATION_CLOSURE_CONSUMER_PREDICATE_V1,
  JULIA_ACTIVATION_CLOSURE_HANDOFF_SCHEMA_V4,
  JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1,
  JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  juliaActivationClosureContentHashV1,
  parseJuliaMaintainerAcknowledgmentV1,
  parseJuliaPixelActivationHandoffV4,
  parseJuliaPixelFinalAuthorityManifestV4,
  verifyJuliaActivationClosureV1,
} from "../src/engine/formulas/v1/julia-activation-closure-v1";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  parseJuliaFinalRecoveryAuditV2,
  parseJuliaPixelFinalCapabilityCensusV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v3";
import {
  parseJuliaFinalRecoveryAuditV3,
  parseJuliaPixelActivationHandoffV3,
  parseJuliaPixelFinalAuthorityManifestV3,
  parseJuliaPixelFinalCapabilityCensusV4,
  verifyJuliaFinalRecoveryActivationHandoffV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v4";
import { parseJuliaMutableStateAdjudicationV1 } from "../src/engine/formulas/v1/julia-mutable-state-adjudication-v1";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

type Json = Record<string, unknown>;
const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const SEALED = {
  authorityState: "sealed" as const,
  supersededBy: null,
  withdrawnBy: null,
};
const seal = (body: Json): Json => ({
  ...body,
  contentHash: juliaActivationClosureContentHashV1(body),
});
const canonical = (value: unknown, budget = 1_048_576) =>
  canonicalJsonV1(value, budget);

function readSourceContents(paths: readonly string[]): Record<string, string> {
  return Object.fromEntries(paths.map((path) => {
    const absolute = join(ROOT, path);
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error(`unsafe-source:${path}`);
    return [path, readFileSync(absolute, "utf8")];
  }));
}
function sourceBindings(): Json {
  return Object.fromEntries(
    JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1.map((path) => [
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
  const predecessorCensus = parseJuliaPixelFinalCapabilityCensusV3(
    predecessorCensusAsset,
  );
  const predecessorAudit = parseJuliaFinalRecoveryAuditV2(predecessorAuditAsset);
  const contract = parseJuliaPixelRecoveryContractV1(contractAsset);
  const adjudication = parseJuliaMutableStateAdjudicationV1(adjudicationAsset);
  const census = parseJuliaPixelFinalCapabilityCensusV4(censusAsset);
  const predecessorAuthority = parseJuliaPixelFinalAuthorityManifestV3(
    predecessorAuthorityAsset,
  );
  const predecessorHandoff = parseJuliaPixelActivationHandoffV3(
    predecessorHandoffAsset,
  );
  const finalAudit = parseJuliaFinalRecoveryAuditV3(finalAuditAsset);
  const acknowledgment = parseJuliaMaintainerAcknowledgmentV1(acknowledgmentAsset);
  if (!baseline.ok || !predecessorCensus.ok || !predecessorAudit.ok || !contract.ok ||
    !adjudication.ok || !census.ok || !predecessorAuthority.ok ||
    !predecessorHandoff.ok || !finalAudit.ok || !acknowledgment.ok) {
    throw new Error("activation-closure-upstream-parse-invalid");
  }
  const predecessorSourceContents = readSourceContents(
    JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  );
  const predecessorResult = verifyJuliaFinalRecoveryActivationHandoffV3(
    predecessorHandoffAsset,
    censusAsset,
    predecessorAuthorityAsset,
    finalAuditAsset,
    baselineAsset,
    predecessorCensusAsset,
    contractAsset,
    predecessorAuditAsset,
    adjudicationAsset,
    predecessorSourceContents,
  );
  if (predecessorResult.code !== "julia-final-recovery-v4-review-pending")
    throw new Error(`activation-closure-predecessor:${predecessorResult.code}`);
  const supported = census.value.rows.filter((row) =>
    row.modeClass === "classic-julia" && row.finalStatus === "supported"
  ).map((row) => row.formulaId).sort();
  const baselineSupported = baseline.value.rows.filter((row) => row.status === "supported")
    .map((row) => row.formulaId).sort();
  const regressions = baselineSupported.filter((id) => !supported.includes(id));
  if (supported.length !== 195 || regressions.length !== 11)
    throw new Error("activation-closure-count-invalid");
  const supportedDigest = sha256HexSyncV1(canonical(supported, 16_384));
  const regressionDigest = sha256HexSyncV1(canonical(regressions, 4096));
  if (acknowledgment.value.finalCensusContentHash !== census.value.contentHash ||
    acknowledgment.value.supportedClassicRowSetDigest !== supportedDigest ||
    acknowledgment.value.regressionSetDigest !== regressionDigest) {
    throw new Error("activation-closure-ack-binding-invalid");
  }
  const bindingMap = sourceBindings();
  const authority = seal({
    schema: JULIA_ACTIVATION_CLOSURE_AUTHORITY_SCHEMA_V4,
    revision: 4,
    authority: SEALED,
    finalCensusContentHash: census.value.contentHash,
    predecessorAuthorityManifestContentHash: predecessorAuthority.value.contentHash,
    predecessorHandoffContentHash: predecessorHandoff.value.contentHash,
    predecessorAuditContentHash: finalAudit.value.contentHash,
    maintainerAcknowledgmentReceiptContentHash: acknowledgment.value.contentHash,
    inputAuthorityContentHashes: [
      contract.value.contentHash,
      predecessorAuthority.value.contentHash,
      predecessorHandoff.value.contentHash,
      finalAudit.value.contentHash,
      acknowledgment.value.contentHash,
    ].sort(),
    sourceBindings: bindingMap,
  });
  const handoff = seal({
    schema: JULIA_ACTIVATION_CLOSURE_HANDOFF_SCHEMA_V4,
    revision: 4,
    authority: SEALED,
    handoffState: "activation-eligible",
    finalCensusContentHash: census.value.contentHash,
    finalCensusAuthorityState: "sealed",
    authorityManifestContentHash: authority.contentHash,
    predecessorHandoffContentHash: predecessorHandoff.value.contentHash,
    supportedClassicRowSetDigest: supportedDigest,
    supportedClassicRowCount: supported.length,
    regressionSetDigest: regressionDigest,
    regressionCount: regressions.length,
    maintainerAcknowledgmentReceiptDigest: acknowledgment.value.contentHash,
    consumerRowPredicate: JULIA_ACTIVATION_CLOSURE_CONSUMER_PREDICATE_V1,
  });
  if (!parseJuliaPixelFinalAuthorityManifestV4(authority).ok ||
    !parseJuliaPixelActivationHandoffV4(handoff).ok) {
    throw new Error("activation-closure-output-parse-invalid");
  }
  const closureSourceContents = readSourceContents(
    JULIA_ACTIVATION_CLOSURE_SOURCE_BINDING_PATHS_V1,
  );
  const verified = verifyJuliaActivationClosureV1({
    baseline: baselineAsset,
    predecessorCensus: predecessorCensusAsset,
    predecessorAudit: predecessorAuditAsset,
    contract: contractAsset,
    adjudication: adjudicationAsset,
    census: censusAsset,
    predecessorAuthority: predecessorAuthorityAsset,
    predecessorHandoff: predecessorHandoffAsset,
    finalAudit: finalAuditAsset,
    acknowledgment: acknowledgmentAsset,
    successorAuthority: authority,
    successorHandoff: handoff,
    predecessorSourceContents,
    closureSourceContents,
  });
  if (!verified.ok) throw new Error(verified.code);
  atomicWrite(
    join(RESOURCE, "julia-pixel-final-authority-manifest.v4.json"),
    authority,
  );
  atomicWrite(
    join(RESOURCE, "julia-pixel-activation-handoff.v4.json"),
    handoff,
  );
}

main();
