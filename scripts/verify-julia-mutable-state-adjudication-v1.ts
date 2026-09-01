/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- independent fail-closed verifier; it does not import the builder.
import { lstatSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { classifyJuliaBindingRolesV1 } from "../src/engine/formulas/v1/julia-binding";
import { runJuliaCpuHarnessV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import { parseJuliaFinalCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-final-capability";
import {
  parseJuliaFinalRecoveryAuditV2,
  parseJuliaPixelFinalCapabilityCensusV3,
} from "../src/engine/formulas/v1/julia-final-recovery-v3";
import {
  deriveJuliaMutableStateAdjudicationIdsV1,
  evaluateJuliaMutableStateSeparationV1,
  isJuliaMutableStateAdjudicationRelativePathV1,
  JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1,
  juliaMutableStateAdjudicationRowReceiptV1,
  juliaMutableStateRendererTupleReceiptV1,
  parseJuliaMutableStateAdjudicationV1,
} from "../src/engine/formulas/v1/julia-mutable-state-adjudication-v1";
import { analyzeJuliaPixelRolesV1 } from "../src/engine/formulas/v1/julia-pixel-role-analyzer";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { parseJuliaPreGpuCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import { parseJuliaRendererEvidenceV1 } from "../src/engine/formulas/v1/julia-renderer-evidence";
import { proposeJuliaSourceSplitV1 } from "../src/engine/formulas/v1/julia-source-split";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const PUBLISHED = join(ROOT, "public/formula-library/v1/runtime/published");
const fail = (message: string): never => {
  throw new Error(`verify-julia-mutable-state-adjudication:${message}`);
};
const json = (path: string): any => JSON.parse(readFileSync(path, "utf8"));
const text = (path: string): string => readFileSync(path, "utf8");
const sha = (path: string): string => sha256HexSyncV1(text(path));
const same = (left: unknown, right: unknown): boolean =>
  canonicalJsonV1(left, 1_048_576) === canonicalJsonV1(right, 1_048_576);
const SOURCE_INPUTS = [
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/julia-pixel-final-capability-census.v3.json",
  "resources/formula-library/v1/julia-pixel-final-recovery-audit.v2.json",
  "resources/formula-library/v1/julia-pixel-role-census.v1.json",
  "resources/formula-library/v1/julia-source-split-evidence.v1.json",
  "resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json",
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "public/formula-library/v1/runtime/published/index.json",
  "src/engine/frm/v1.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-final-capability.ts",
  "src/engine/formulas/v1/julia-final-recovery-v3.ts",
  "src/engine/formulas/v1/julia-mutable-state-adjudication-v1.ts",
  "src/engine/formulas/v1/julia-pixel-role-analyzer.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/julia-pre-gpu-capability.ts",
  "src/engine/formulas/v1/julia-renderer-evidence.ts",
  "src/engine/formulas/v1/julia-source-split.ts",
  "src/engine/formulas/v1/publication-decisions.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/safety-envelope.ts",
  "scripts/build-julia-mutable-state-adjudication-v1.ts",
  "scripts/verify-julia-mutable-state-adjudication-v1.ts",
] as const;

function safeFile(root: string, path: string): string {
  if (!isJuliaMutableStateAdjudicationRelativePathV1(path)) fail(`path-shape:${path}`);
  const absolute = resolve(root, path);
  const child = relative(root, absolute);
  if (child === "" || child.startsWith("..")) fail(`path-escape:${path}`);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    fail(`unsafe-file:${path}`);
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

function mapRows(asset: any): Map<string, any> {
  return new Map(asset.rows.map((row: any) => [row.formulaId, row]));
}

async function verify(): Promise<void> {
  const assetValue = json(join(RESOURCE, "julia-mutable-state-adjudication.v1.json"));
  const parsedAsset = parseJuliaMutableStateAdjudicationV1(assetValue);
  if (!parsedAsset.ok) fail("asset-parser");
  const asset = parsedAsset.value;
  const contractAsset = json(join(RESOURCE, "julia-pixel-recovery-contract.v1.json"));
  const finalV3Asset = json(join(RESOURCE, "julia-pixel-final-capability-census.v3.json"));
  const auditV3Asset = json(join(RESOURCE, "julia-pixel-final-recovery-audit.v2.json"));
  const roleAsset = json(join(RESOURCE, "julia-pixel-role-census.v1.json"));
  const splitAsset = json(join(RESOURCE, "julia-source-split-evidence.v1.json"));
  const preGpuAsset = json(join(RESOURCE, "julia-pre-gpu-capability-census.v1.json"));
  const rendererAsset = json(join(RESOURCE, "julia-renderer-evidence.v1.json"));
  const finalV1Asset = json(join(RESOURCE, "julia-final-capability-census.v1.json"));
  const runtimeAsset = json(join(PUBLISHED, "index.json"));
  const contract = parseJuliaPixelRecoveryContractV1(contractAsset);
  const finalV3 = parseJuliaPixelFinalCapabilityCensusV3(finalV3Asset);
  const auditV3 = parseJuliaFinalRecoveryAuditV2(auditV3Asset);
  const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
  const renderer = parseJuliaRendererEvidenceV1(rendererAsset);
  const finalV1 = parseJuliaFinalCapabilityCensusV1(finalV1Asset);
  const runtime = parsePublishedFormulaRuntimeIndexV1(runtimeAsset);
  const ledgerResult = createPublicationDecisionLedgerV1(
    json(join(RESOURCE, "publication-decisions.json")),
  );
  if (
    !contract.ok || !finalV3.ok || !auditV3.ok || !preGpu.ok || !renderer.ok ||
    !finalV1.ok || !runtime.ok || !ledgerResult.ok
  ) fail("upstream-parser");
  if (
    asset.recoveryContractContentHash !== contract.value.contentHash ||
    asset.finalV3ContentHash !== finalV3.value.contentHash ||
    asset.finalV3WholeFileSha256 !== sha(join(RESOURCE, "julia-pixel-final-capability-census.v3.json")) ||
    asset.finalV3AuditContentHash !== auditV3.value.contentHash ||
    asset.sourceSplitContentHash !== splitAsset.contentHash ||
    asset.preGpuContentHash !== preGpu.value.contentHash ||
    asset.rendererContentHash !== renderer.value.contentHash ||
    asset.finalV1ContentHash !== finalV1.value.contentHash
  ) fail("authority-binding");
  const publicationLedger = { rows: ledgerResult.ledger.rows };
  const derivedIds = deriveJuliaMutableStateAdjudicationIdsV1({
    auditV3: auditV3Asset,
    finalV3: finalV3Asset,
    roleV1: roleAsset,
    sourceSplitV1: splitAsset,
    preGpuV1: preGpuAsset,
    rendererV1: rendererAsset,
    finalV1: finalV1Asset,
    publicationLedger,
  });
  if (
    !same(derivedIds, JULIA_MUTABLE_STATE_ADJUDICATION_IDS_V1) ||
    !same(asset.rows.map((row) => row.formulaId), derivedIds)
  ) fail("independent-exact-set");
  const roleRows = mapRows(roleAsset);
  const splitRows = mapRows(splitAsset);
  const preGpuRows = mapRows(preGpuAsset);
  const rendererRows = mapRows(rendererAsset);
  const finalV1Rows = mapRows(finalV1Asset);
  const runtimeRows = mapRows(runtimeAsset);
  const dynamicInputs: string[] = [];
  const expectedRows: any[] = [];
  for (const row of asset.rows) {
    const formulaId = row.formulaId;
    const roleRow = roleRows.get(formulaId);
    const splitRow = splitRows.get(formulaId);
    const preGpuRow = preGpuRows.get(formulaId);
    const rendererRow = rendererRows.get(formulaId);
    const finalV1Row = finalV1Rows.get(formulaId);
    const runtimeRow = runtimeRows.get(formulaId);
    const decision = ledgerResult.ledger.decisionFor(formulaId);
    if (!roleRow || !splitRow || !preGpuRow || !rendererRow || !finalV1Row || !runtimeRow || !decision)
      fail(`missing:${formulaId}`);
    if (
      decision.publicationDecision !== "publish" ||
      decision.leakageScanStatus !== "passed" ||
      splitRow.rights.publicationDecision !== decision.publicationDecision ||
      splitRow.rights.leakageScanStatus !== decision.leakageScanStatus ||
      splitRow.rights.rightsStatus !== decision.rightsStatus
    ) fail(`rights:${formulaId}`);
    const candidateRelative = `resources/formula-library/v1/${row.candidatePath}`;
    const baselineRelative =
      `public/formula-library/v1/runtime/published/${runtimeRow.definitionPath}`;
    dynamicInputs.push(candidateRelative, baselineRelative);
    const candidateFile = safeFile(RESOURCE, row.candidatePath);
    const baselineFile = safeFile(PUBLISHED, runtimeRow.definitionPath);
    const candidateSource = text(candidateFile);
    const baselineSource = text(baselineFile);
    const candidateParsed = parseFrmLikeV1(candidateSource);
    const baselineParsed = parseFrmLikeV1(baselineSource);
    if (!candidateParsed.ok || !baselineParsed.ok) fail(`parse:${formulaId}`);
    const candidateHash = await hashFrmLikeV1(candidateSource, candidateParsed.ir);
    const baselineHash = await hashFrmLikeV1(baselineSource, baselineParsed.ir);
    const proposal = proposeJuliaSourceSplitV1(baselineParsed.ir);
    if (
      !proposal.ok || proposal.source !== candidateSource ||
      proposal.sourceRevision !== candidateHash.sourceRevision ||
      baselineHash.sourceRevision !== runtimeRow.sourceRevision ||
      baselineHash.semanticHash !== runtimeRow.semanticHash ||
      baselineHash.sourceRevision !== splitRow.baselineSourceRevision ||
      baselineHash.semanticHash !== splitRow.baselineSemanticHash ||
      candidateHash.sourceRevision !== splitRow.identity.candidateSourceRevision ||
      candidateHash.semanticHash !== splitRow.identity.candidateSemanticHash
    ) fail(`source-identity:${formulaId}`);
    const safety = await validateFormulaSafetyEnvelopeV1({
      schemaVersion: 1,
      source: candidateSource,
      sourceRevision: candidateHash.sourceRevision,
      semanticHash: candidateHash.semanticHash,
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      supportedNumericProfiles: ["standard32"],
      parameters: candidateParsed.ir.parameters,
      programModel: "orbit",
      termination: {
        predicateMeaning: "continue-iteration",
        nonFinite: "terminate-with-event",
        maximumIterations: "profile-resolved",
      },
      channels: [],
      capabilities: [],
    });
    if (!safety.ok) fail(`safety:${formulaId}`);
    const binding = {
      kind: "source-split" as const,
      sourceRevision: candidateHash.sourceRevision,
    };
    const sourceBinding = {
      source: candidateSource,
      sourceRevision: candidateHash.sourceRevision,
    };
    const classified = classifyJuliaBindingRolesV1(candidateParsed.ir, binding, sourceBinding);
    const currentRole = analyzeJuliaPixelRolesV1(candidateParsed.ir);
    if (
      !classified.ok || classified.contract.modeClass !== "classic-julia" ||
      classified.contract.supportLane !== "source-split" ||
      classified.contract.z0Role !== "pixel-seed" ||
      currentRole.modeClass !== "undetermined" ||
      !currentRole.reasonCodes.some((reason) =>
        reason === "mutable-pixel-alias" || reason === "identity-authority-required")
    ) fail(`role-contract:${formulaId}`);
    const harness = runJuliaCpuHarnessV1(candidateParsed.ir, binding, {
      sourceBinding,
      parameterPlaneBaseline: {
        source: baselineSource,
        sourceRevision: baselineHash.sourceRevision,
      },
      parameters: parameters(runtimeRow),
    });
    if (!harness.ok || !harness.value.candidatePass || !Object.values(harness.value.checks).every(Boolean))
      fail(`cpu-harness:${formulaId}`);
    const baselineLocals = new Set(baselineParsed.ir.locals.map((local: any) => local.name));
    const newLocals = candidateParsed.ir.locals
      .map((local: any) => local.name)
      .filter((name: string) => !baselineLocals.has(name));
    const frozenTargets = splitRow.rewrite.aliasTargets.length > 0
      ? [...splitRow.rewrite.aliasTargets]
      : newLocals;
    const evaluation = evaluateJuliaMutableStateSeparationV1(
      baselineParsed.ir,
      candidateParsed.ir,
      frozenTargets,
      parameters(runtimeRow),
    );
    if (!evaluation.passed) fail(`state-separation:${formulaId}`);
    if (
      rendererRow.status !== "passed" ||
      rendererRow.evaluatedSourceRevision !== candidateHash.sourceRevision ||
      rendererRow.evaluatedSemanticHash !== candidateHash.semanticHash ||
      rendererRow.bindingRevision !== splitRow.tier1.bindingRevision ||
      preGpuRow.disposition !== "tier2-pending" ||
      preGpuRow.evaluatedSourceRevision !== candidateHash.sourceRevision ||
      preGpuRow.evaluatedSemanticHash !== candidateHash.semanticHash ||
      preGpuRow.bindingRevision !== splitRow.tier1.bindingRevision ||
      finalV1Row.status !== "supported" || finalV1Row.lane !== "source-split" ||
      finalV1Row.evaluatedSourceRevision !== candidateHash.sourceRevision ||
      finalV1Row.evaluatedSemanticHash !== candidateHash.semanticHash ||
      finalV1Row.bindingRevision !== splitRow.tier1.bindingRevision ||
      finalV1Row.profileDigest !== rendererRow.profileDigest ||
      rendererAsset.preGpuContentHash !== preGpuAsset.contentHash ||
      finalV1Asset.preGpuContentHash !== preGpuAsset.contentHash ||
      finalV1Asset.rendererEvidenceContentHash !== rendererAsset.contentHash ||
      finalV1Row.preGpuEvidenceContentHash !== preGpuAsset.contentHash ||
      finalV1Row.tier2EvidenceContentHash !== rendererAsset.contentHash
    ) fail(`renderer-lineage:${formulaId}`);
    const rendererTupleReceipt = juliaMutableStateRendererTupleReceiptV1({
      rendererContentHash: rendererAsset.contentHash,
      formulaId,
      evaluatedSourceRevision: rendererRow.evaluatedSourceRevision,
      evaluatedSemanticHash: rendererRow.evaluatedSemanticHash,
      bindingRevision: rendererRow.bindingRevision,
      profileDigest: rendererRow.profileDigest,
      status: rendererRow.status,
      rendererClass: rendererRow.rendererClass,
      fullFrameworkCompileLink: rendererRow.fullFrameworkCompileLink,
      deterministicDoubleDraw: rendererRow.deterministicDoubleDraw,
      traceDepthComparisons: rendererRow.traceDepthComparisons,
      imagePixelComparisons: rendererRow.imagePixelComparisons,
      relativeTolerance: rendererRow.relativeTolerance,
    });
    const withoutReceipt = {
      formulaId,
      baselineSourceRevision: baselineHash.sourceRevision,
      baselineSemanticHash: baselineHash.semanticHash,
      candidatePath: row.candidatePath,
      candidateSourceRevision: candidateHash.sourceRevision,
      candidateSemanticHash: candidateHash.semanticHash,
      binding,
      legacyBindingRevision: splitRow.tier1.bindingRevision,
      supportLane: "state-separated" as const,
      sourceSplitKind: splitRow.rewrite.kind,
      reasonCode: "mutable-pixel-alias-held" as const,
      stateSeparation: {
        classContract: "frozen-julia-constant-vs-dynamic-orbit-state/v1" as const,
        operationalEquivalence: true as const,
        frozenTargetCount: evaluation.structural.frozenTargetCount,
        baselineMutableTargetCount: evaluation.structural.baselineMutableTargetCount,
        baselineComponentTargetCount: evaluation.structural.baselineComponentTargetCount,
        candidateMutableTargetCount: evaluation.structural.candidateMutableTargetCount,
        candidateComponentTargetCount: evaluation.structural.candidateComponentTargetCount,
        frozenTargetsNotWritten: evaluation.structural.frozenTargetsNotWritten,
        frozenTargetsLiveInLoop: evaluation.structural.frozenTargetsLiveInLoop,
        baselineMutableSurfaceDisjointFromFrozenTargets:
          evaluation.structural.baselineMutableSurfaceDisjointFromFrozenTargets,
        candidateMutableSurfaceDisjointFromFrozenTargets:
          evaluation.structural.candidateMutableSurfaceDisjointFromFrozenTargets,
        systemCNotWrittenInLoop: evaluation.structural.systemCNotWrittenInLoop,
        parameterPlaneBitIdentical: evaluation.parameterPlane.passed,
        parameterPlaneSnapshotComparisons: evaluation.parameterPlane.snapshotComparisons,
        parameterPlaneFrozenChannelComparisons: evaluation.parameterPlane.frozenChannelComparisons,
        candidateStateShapeComparisons: evaluation.parameterPlane.stateShapeComparisons,
        juliaFullStateDeterministic: evaluation.juliaDeterminism.passed,
        juliaSnapshotComparisons: evaluation.juliaDeterminism.snapshotComparisons,
        juliaFrozenChannelComparisons: evaluation.juliaDeterminism.frozenChannelComparisons,
      },
      tier0: "pass" as const,
      tier1: "pass" as const,
      tier2: "reused-pass-exact-tuple" as const,
      rendererProfileDigest: rendererRow.profileDigest,
      rendererTupleReceipt,
    };
    expectedRows.push({
      ...withoutReceipt,
      rowReceipt: juliaMutableStateAdjudicationRowReceiptV1(withoutReceipt),
    });
  }
  if (!same(expectedRows, asset.rows)) fail("row-reconstruction");
  const expectedBindings = Object.fromEntries(
    [...new Set([...SOURCE_INPUTS, ...dynamicInputs])]
      .sort()
      .map((path) => [path, sha(safeFile(ROOT, path))]),
  );
  if (!same(expectedBindings, asset.sourceBindings)) fail("source-binding-map");
  const expectedSummary = {
    directPixelCount: expectedRows.filter((row) => row.sourceSplitKind === "direct-pixel").length,
    pixelAliasCount: expectedRows.filter((row) => row.sourceSplitKind === "pixel-alias").length,
    parameterPlaneSnapshotComparisons: expectedRows.reduce(
      (sum, row) => sum + row.stateSeparation.parameterPlaneSnapshotComparisons,
      0,
    ),
    juliaSnapshotComparisons: expectedRows.reduce(
      (sum, row) => sum + row.stateSeparation.juliaSnapshotComparisons,
      0,
    ),
    candidateStateShapeComparisons: expectedRows.reduce(
      (sum, row) => sum + row.stateSeparation.candidateStateShapeComparisons,
      0,
    ),
  };
  if (!same(expectedSummary, asset.summary)) fail("summary");
  process.stdout.write(`${JSON.stringify({
    ok: true,
    rows: asset.rowCount,
    exact9: expectedRows.length,
    tier2: asset.tier2,
    summary: asset.summary,
  })}\n`);
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
