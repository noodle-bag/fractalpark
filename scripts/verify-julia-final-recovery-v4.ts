import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  parseJuliaFinalRecoveryAuditV2,
  parseJuliaPixelFinalCapabilityCensusV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v3";
import {
  JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS,
  parseJuliaFinalRecoveryAuditV3,
  parseJuliaPixelActivationHandoffV3,
  parseJuliaPixelFinalAuthorityManifestV3,
  parseJuliaPixelFinalCapabilityCensusV4,
  verifyJuliaFinalRecoveryActivationHandoffV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v4";
import {
  JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1,
  parseJuliaMutableStateAdjudicationV1,
} from "../src/engine/formulas/v1/julia-mutable-state-adjudication-v1";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const fail = (message: string): never => {
  throw new Error(`verify-julia-final-recovery-v4:${message}`);
};
const json = (name: string): unknown =>
  JSON.parse(readFileSync(join(RESOURCE, name), "utf8"));
const same = (left: unknown, right: unknown): boolean =>
  canonicalJsonV1(left, 1_048_576) === canonicalJsonV1(right, 1_048_576);

function sourceContents(): Record<string, string> {
  return Object.fromEntries(
    JULIA_FINAL_RECOVERY_V4_SOURCE_BINDING_PATHS.map((path) => {
      const absolute = join(ROOT, path);
      const stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        fail(`unsafe-source:${path}`);
      return [path, readFileSync(absolute, "utf8")];
    }),
  );
}

function main(): void {
  const baselineValue = json("julia-final-capability-census.v1.json");
  const predecessorValue = json("julia-pixel-final-capability-census.v3.json");
  const predecessorAuditValue = json("julia-pixel-final-recovery-audit.v2.json");
  const contractValue = json("julia-pixel-recovery-contract.v1.json");
  const adjudicationValue = json("julia-mutable-state-adjudication.v1.json");
  const censusValue = json("julia-pixel-final-capability-census.v4.json");
  const authorityValue = json("julia-pixel-final-authority-manifest.v3.json");
  const handoffValue = json("julia-pixel-activation-handoff.v3.json");
  const auditValue = json("julia-pixel-final-recovery-audit.v3.json");
  const baseline = parseJuliaFinalCapabilityCensusV1(baselineValue);
  const predecessor = parseJuliaPixelFinalCapabilityCensusV3(predecessorValue);
  const predecessorAudit = parseJuliaFinalRecoveryAuditV2(predecessorAuditValue);
  const contract = parseJuliaPixelRecoveryContractV1(contractValue);
  const adjudication = parseJuliaMutableStateAdjudicationV1(adjudicationValue);
  const census = parseJuliaPixelFinalCapabilityCensusV4(censusValue);
  const authority = parseJuliaPixelFinalAuthorityManifestV3(authorityValue);
  const handoff = parseJuliaPixelActivationHandoffV3(handoffValue);
  const audit = parseJuliaFinalRecoveryAuditV3(auditValue);
  if (!baseline.ok) throw new Error("verify-julia-final-recovery-v4:baseline-parser");
  if (!predecessor.ok) throw new Error("verify-julia-final-recovery-v4:predecessor-parser");
  if (!predecessorAudit.ok) throw new Error("verify-julia-final-recovery-v4:predecessor-audit-parser");
  if (!contract.ok) throw new Error("verify-julia-final-recovery-v4:contract-parser");
  if (!adjudication.ok) throw new Error("verify-julia-final-recovery-v4:adjudication-parser");
  if (!census.ok) throw new Error("verify-julia-final-recovery-v4:census-parser");
  if (!authority.ok) throw new Error("verify-julia-final-recovery-v4:authority-parser");
  if (!handoff.ok) throw new Error("verify-julia-final-recovery-v4:handoff-parser");
  if (!audit.ok) throw new Error("verify-julia-final-recovery-v4:audit-parser");
  const predecessorRows = predecessor.value.rows;
  const censusRows = census.value.rows;
  const auditSnapshot = audit.value;
  const handoffSnapshot = handoff.value;
  const consumer = verifyJuliaFinalRecoveryActivationHandoffV3(
    handoffValue,
    censusValue,
    authorityValue,
    auditValue,
    baselineValue,
    predecessorValue,
    contractValue,
    predecessorAuditValue,
    adjudicationValue,
    sourceContents(),
  );
  if (consumer.code !== "julia-final-recovery-v4-review-pending")
    fail(`consumer:${consumer.code}`);
  const targetSet = new Set<string>(JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1);
  let unchanged = 0;
  let changed = 0;
  for (let index = 0; index < predecessorRows.length; index += 1) {
    const before = predecessorRows[index]!;
    const after = censusRows[index]!;
    if (targetSet.has(before.formulaId)) {
      changed += 1;
      if (
        before.finalStatus !== "held" ||
        before.remediationLane !== "mutable-state-separation" ||
        after.finalStatus !== "supported" ||
        after.modeClass !== "classic-julia" ||
        after.supportLane !== "state-separated" ||
        after.remediationLane !== "none" ||
        after.rewriteClass !== "E0-operational-equivalence" ||
        after.roles.includes("role:unresolved") ||
        !after.roles.includes("role:derived-pixel-constant") ||
        !after.roles.includes("role:dynamic-orbit-state") ||
        after.receipts.tier2 === before.receipts.tier2
      ) fail(`target-projection:${before.formulaId}`);
    } else {
      unchanged += 1;
      if (!same(before, after)) fail(`non-target-drift:${before.formulaId}`);
    }
  }
  if (changed !== 9 || unchanged !== 525) fail("projection-count");
  if (!same(auditSnapshot.recoveredRegressionIds, JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1))
    fail("recovered-set");
  if ((auditSnapshot.cumulativeRecoveredRegressionIds as string[]).length !== 16)
    fail("cumulative-recovered-count");
  if (!same(auditSnapshot.statusCounts, {
    supported: 195,
    held: 151,
    blocked: 72,
    unknown: 116,
    notApplicable: 0,
  })) fail("status-counts");
  if (handoffSnapshot.handoffState !== "review-pending" ||
    handoffSnapshot.maintainerAcknowledgmentReceiptDigest !== null)
    fail("activation-boundary");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    rows: censusRows.length,
    exact9Changed: changed,
    nonTargetUnchanged: unchanged,
    counts: auditSnapshot.statusCounts,
    regressions: (auditSnapshot.regressionIds as string[]).length,
    handoff: handoffSnapshot.handoffState,
  })}\n`);
}

main();
