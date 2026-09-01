/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- independent fail-closed verifier; it does not import the builder.
import { lstatSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { classifyJuliaBindingRolesV1 } from "../src/engine/formulas/v1/julia-binding";
import {
  deriveJuliaClassicRegressionCorrectiveIdsV1,
  isJuliaClassicRegressionCorrectiveRelativePathV1,
  parseJuliaClassicRegressionCorrectiveV1,
} from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import { runJuliaCpuHarnessV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import {
  analyzeJuliaPixelChangedRegionsV1,
  verifyJuliaPixelChangedRegionCoverageV1,
} from "../src/engine/formulas/v1/julia-pixel-changed-region";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import { sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const RESOURCES = join(ROOT, "resources/formula-library/v1");
const PUBLISHED = join(ROOT, "public/formula-library/v1/runtime/published");
const fail = (message: string): never => {
  throw Error(`verify-julia-classic-regression-corrective:${message}`);
};
const json = (path: string) => JSON.parse(readFileSync(path, "utf8")) as any;
const text = (path: string) => readFileSync(path, "utf8");
const sha = (path: string) => sha256HexSyncV1(text(path));

function safeFile(root: string, path: string): string {
  if (!isJuliaClassicRegressionCorrectiveRelativePathV1(path))
    fail(`path-shape:${path}`);
  const absolute = resolve(root, path);
  const relativePath = relative(root, absolute);
  if (relativePath === "" || relativePath.startsWith(".."))
    fail(`path-escape:${path}`);
  const status = lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1)
    fail(`unsafe-path:${path}`);
  return absolute;
}

function parameters(row: any): Record<string, unknown> {
  return Object.fromEntries(
    row.parameters.map((parameter: any) => [
      parameter.slotName,
      parameter.type === "complex"
        ? [parameter.default[0], parameter.default[1]]
        : parameter.default,
    ]),
  );
}

async function verify(): Promise<void> {
  const asset = json(
    join(RESOURCES, "julia-classic-regression-corrective.v1.json"),
  );
  const parsed = parseJuliaClassicRegressionCorrectiveV1(asset);
  if (!parsed.ok) fail("asset");
  const corrective = parsed.value;
  const audit = json(
    join(RESOURCES, "julia-pixel-final-recovery-audit.v1.json"),
  );
  const finalV2 = json(
    join(RESOURCES, "julia-pixel-final-capability-census.v2.json"),
  );
  const preGpuV2 = json(
    join(RESOURCES, "julia-pre-gpu-recovery-census.v2.json"),
  );
  const roleV1 = json(join(RESOURCES, "julia-pixel-role-census.v1.json"));
  const finalV1 = json(
    join(RESOURCES, "julia-final-capability-census.v1.json"),
  );
  const sourceSplitV1 = json(
    join(RESOURCES, "julia-source-split-evidence.v1.json"),
  );
  const rendererV1 = json(join(RESOURCES, "julia-renderer-evidence.v1.json"));
  const runtime = json(join(PUBLISHED, "index.json"));
  const contract = json(
    join(RESOURCES, "julia-pixel-recovery-contract.v1.json"),
  );
  const parsedContract = parseJuliaPixelRecoveryContractV1(contract);
  if (
    !parsedContract.ok ||
    corrective.recoveryContractContentHash !== parsedContract.value.contentHash
  )
    fail("recovery-contract");
  const ledgerResult = createPublicationDecisionLedgerV1(
    json(join(RESOURCES, "publication-decisions.json")),
  );
  if (!ledgerResult.ok) fail("publication-ledger");
  const derivedIds = deriveJuliaClassicRegressionCorrectiveIdsV1({
    audit,
    finalV2,
    preGpuV2,
    roleV1,
    finalV1,
    sourceSplitV1,
    rendererV1,
    publicationLedger: { rows: ledgerResult.ledger.rows },
  });
  if (
    JSON.stringify(corrective.rows.map((row) => row.formulaId)) !==
      JSON.stringify(derivedIds) ||
    derivedIds.length !== 7
  )
    fail("independent-derivation");
  if (
    corrective.finalV2ContentHash !== finalV2.contentHash ||
    corrective.finalV2WholeFileSha256 !==
      sha(join(RESOURCES, "julia-pixel-final-capability-census.v2.json")) ||
    corrective.finalV2AuditContentHash !== audit.contentHash
  )
    fail("authority-binding");
  for (const [path, expectedHash] of Object.entries(
    corrective.sourceBindings,
  )) {
    if (sha(safeFile(ROOT, path)) !== expectedHash)
      fail(`source-binding:${path}`);
  }
  const map = (authority: any) =>
    new Map(authority.rows.map((row: any) => [row.formulaId, row]));
  const [preGpu, roles, finals, sourceSplit, renderer, published] = [
    preGpuV2,
    roleV1,
    finalV1,
    sourceSplitV1,
    rendererV1,
    runtime,
  ].map(map);
  for (const row of corrective.rows) {
    const pre = preGpu.get(row.formulaId),
      role = roles.get(row.formulaId),
      final = finals.get(row.formulaId);
    const split = sourceSplit.get(row.formulaId),
      rendererRow = renderer.get(row.formulaId),
      runtimeRow = published.get(row.formulaId);
    const decision = ledgerResult.ledger.decisionFor(row.formulaId);
    if (
      !pre ||
      !role ||
      !final ||
      !split ||
      !rendererRow ||
      !runtimeRow ||
      !decision ||
      decision.publicationDecision !== "publish" ||
      decision.leakageScanStatus !== "passed" ||
      split.rights.publicationDecision !== decision.publicationDecision ||
      split.rights.leakageScanStatus !== decision.leakageScanStatus ||
      split.rights.rightsStatus !== decision.rightsStatus
    )
      fail(`current-rights:${row.formulaId}`);
    const candidateFile = safeFile(RESOURCES, row.candidatePath);
    const baselineFile = safeFile(PUBLISHED, runtimeRow.definitionPath);
    const candidateSource = text(candidateFile),
      baselineSource = text(baselineFile);
    const candidateIr = parseFrmLikeV1(candidateSource),
      baselineIr = parseFrmLikeV1(baselineSource);
    if (!candidateIr.ok || !baselineIr.ok) fail(`parse:${row.formulaId}`);
    const candidateHash = await hashFrmLikeV1(candidateSource, candidateIr.ir);
    const baselineHash = await hashFrmLikeV1(baselineSource, baselineIr.ir);
    if (
      candidateHash.sourceRevision !== row.candidateSourceRevision ||
      candidateHash.semanticHash !== row.candidateSemanticHash ||
      baselineHash.sourceRevision !== row.baselineSourceRevision ||
      baselineHash.semanticHash !== row.baselineSemanticHash ||
      runtimeRow.sourceRevision !== baselineHash.sourceRevision ||
      runtimeRow.semanticHash !== baselineHash.semanticHash ||
      split.identity.candidateSourceRevision !== candidateHash.sourceRevision ||
      split.identity.candidateSemanticHash !== candidateHash.semanticHash ||
      split.tier1.bindingRevision !== row.legacyBindingRevision ||
      rendererRow.status !== "passed" ||
      rendererRow.evaluatedSourceRevision !== candidateHash.sourceRevision ||
      rendererRow.evaluatedSemanticHash !== candidateHash.semanticHash ||
      rendererRow.bindingRevision !== row.legacyBindingRevision ||
      final.status !== "supported" ||
      final.lane !== "source-split" ||
      final.evaluatedSourceRevision !== candidateHash.sourceRevision ||
      final.evaluatedSemanticHash !== candidateHash.semanticHash ||
      final.bindingRevision !== row.legacyBindingRevision
    )
      fail(`legacy-binding:${row.formulaId}`);
    const binding = {
      kind: "source-split" as const,
      sourceRevision: candidateHash.sourceRevision,
    };
    const classified = classifyJuliaBindingRolesV1(candidateIr.ir, binding, {
      source: candidateSource,
      sourceRevision: candidateHash.sourceRevision,
    });
    if (
      !classified.ok ||
      classified.contract.modeClass !== "classic-julia" ||
      classified.contract.z0Role !== "pixel-seed"
    )
      fail(`classify:${row.formulaId}`);
    const harness = runJuliaCpuHarnessV1(candidateIr.ir, binding, {
      sourceBinding: {
        source: candidateSource,
        sourceRevision: candidateHash.sourceRevision,
      },
      parameterPlaneBaseline: {
        source: baselineSource,
        sourceRevision: baselineHash.sourceRevision,
      },
      parameters: parameters(runtimeRow),
    });
    if (
      !harness.ok ||
      !harness.value.candidatePass ||
      !Object.values(harness.value.checks).every(Boolean)
    )
      fail(`cpu:${row.formulaId}`);
    const analysis = await analyzeJuliaPixelChangedRegionsV1(
      {
        formulaId: row.formulaId,
        source: baselineSource,
        sourceRevision: baselineHash.sourceRevision,
        semanticHash: baselineHash.semanticHash,
        sourceAuthorityContentHash: parsedContract.value.contentHash,
        ir: baselineIr.ir,
      },
      {
        formulaId: row.formulaId,
        source: candidateSource,
        sourceRevision: candidateHash.sourceRevision,
        semanticHash: candidateHash.semanticHash,
        sourceAuthorityContentHash: parsedContract.value.contentHash,
        ir: candidateIr.ir,
      },
    );
    if (!analysis.ok) fail(`e0-analysis:${row.formulaId}`);
    const coverage = verifyJuliaPixelChangedRegionCoverageV1(
      analysis.value,
      analysis.value.regions.map((region) => ({
        regionId: region.regionId,
        coveredModes: region.requiredCoverageModes,
      })),
    );
    if (
      !coverage.ok ||
      row.e0.analyzerRevision !==
        parsedContract.value.changedRegionAnalyzer.revision ||
      row.e0.analysisContentHash !== analysis.value.contentHash ||
      row.e0.changedRegionCount !== analysis.value.regions.length ||
      row.e0.reachableOrUnknownRegionCount !==
        analysis.value.reachableOrUnknownRegionCount ||
      row.e0.coveredRegionCount !== coverage.coveredRegionCount ||
      row.e0.uncoveredReachableOrUnknownRegionCount !==
        coverage.uncoveredReachableOrUnknownRegionCount
    )
      fail(`e0-receipt:${row.formulaId}`);
  }
  console.log(
    "julia-classic-regression-corrective: verified exact-7 pre-gpu authority",
  );
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
