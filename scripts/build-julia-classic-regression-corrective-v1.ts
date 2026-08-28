/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- fail-closed evidence builder over sealed JSON authorities.
import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import { classifyJuliaBindingRolesV1 } from "../src/engine/formulas/v1/julia-binding";
import {
  deriveJuliaClassicRegressionCorrectiveIdsV1,
  isJuliaClassicRegressionCorrectiveRelativePathV1,
  juliaClassicRegressionCorrectiveContentHashV1,
  juliaClassicRegressionCorrectiveRowReceiptV1,
  parseJuliaClassicRegressionCorrectiveV1,
  type JuliaClassicRegressionCorrectiveRowV1,
} from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import { runJuliaCpuHarnessV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import {
  analyzeJuliaPixelChangedRegionsV1,
  verifyJuliaPixelChangedRegionCoverageV1,
} from "../src/engine/formulas/v1/julia-pixel-changed-region";
import { parseJuliaPixelRecoveryContractV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-contract";
import { createPublicationDecisionLedgerV1 } from "../src/engine/formulas/v1/publication-decisions";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";
import { validateFormulaSafetyEnvelopeV1 } from "../src/engine/formulas/v1/safety-envelope";

const ROOT = process.cwd();
const RESOURCES = join(ROOT, "resources/formula-library/v1");
const PUBLISHED = join(ROOT, "public/formula-library/v1/runtime/published");
const OUTPUT = join(RESOURCES, "julia-classic-regression-corrective.v1.json");
const fail = (message: string): never => {
  throw Error(`julia-classic-regression-corrective:${message}`);
};
const readJson = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as any;
const readText = (path: string) => readFileSync(path, "utf8");
const contentHash = (path: string) => sha256HexSyncV1(readText(path));
const sourceInputs = [
  "resources/formula-library/v1/julia-pixel-recovery-contract.v1.json",
  "resources/formula-library/v1/publication-decisions.json",
  "resources/formula-library/v1/julia-pixel-final-recovery-audit.v1.json",
  "resources/formula-library/v1/julia-pixel-final-capability-census.v2.json",
  "resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json",
  "resources/formula-library/v1/julia-pixel-role-census.v1.json",
  "resources/formula-library/v1/julia-final-capability-census.v1.json",
  "resources/formula-library/v1/julia-source-split-evidence.v1.json",
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  "public/formula-library/v1/runtime/published/index.json",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-pixel-changed-region.ts",
  "src/engine/formulas/v1/julia-pixel-recovery-contract.ts",
  "src/engine/formulas/v1/publication-decisions.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/safety-envelope.ts",
  "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
  "scripts/build-julia-classic-regression-corrective-v1.ts",
  "scripts/verify-julia-classic-regression-corrective-v1.ts",
];

function safeFile(root: string, path: string): string {
  if (!isJuliaClassicRegressionCorrectiveRelativePathV1(path))
    fail(`path-shape:${path}`);
  const absolute = resolve(root, path);
  const relativePath = relative(root, absolute);
  if (relativePath === "" || relativePath.startsWith(".."))
    fail(`path-escape:${path}`);
  const status = lstatSync(absolute);
  if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1)
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

function correctiveBindingRevision(
  formulaId: string,
  sourceRevision: string,
  binding: unknown,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1({
      domain: "fractalpark/7e-i/binding/v1",
      formulaId,
      sourceRevision,
      binding,
    }),
  );
}

async function build(): Promise<unknown> {
  const audit = readJson(
    join(RESOURCES, "julia-pixel-final-recovery-audit.v1.json"),
  );
  const finalV2 = readJson(
    join(RESOURCES, "julia-pixel-final-capability-census.v2.json"),
  );
  const preGpuV2 = readJson(
    join(RESOURCES, "julia-pre-gpu-recovery-census.v2.json"),
  );
  const roleV1 = readJson(join(RESOURCES, "julia-pixel-role-census.v1.json"));
  const finalV1 = readJson(
    join(RESOURCES, "julia-final-capability-census.v1.json"),
  );
  const sourceSplitV1 = readJson(
    join(RESOURCES, "julia-source-split-evidence.v1.json"),
  );
  const rendererV1 = readJson(
    join(RESOURCES, "julia-renderer-evidence.v1.json"),
  );
  const runtime = readJson(join(PUBLISHED, "index.json"));
  const contract = readJson(
    join(RESOURCES, "julia-pixel-recovery-contract.v1.json"),
  );
  const parsedContract = parseJuliaPixelRecoveryContractV1(contract);
  if (!parsedContract.ok) fail("recovery-contract");
  const ledgerResult = createPublicationDecisionLedgerV1(
    readJson(join(RESOURCES, "publication-decisions.json")),
  );
  if (!ledgerResult.ok) fail("publication-ledger");
  const ledger = { rows: ledgerResult.ledger.rows };
  const derivedIds = deriveJuliaClassicRegressionCorrectiveIdsV1({
    audit,
    finalV2,
    preGpuV2,
    roleV1,
    finalV1,
    sourceSplitV1,
    rendererV1,
    publicationLedger: ledger,
  });
  if (
    JSON.stringify(derivedIds) !==
    JSON.stringify(
      deriveJuliaClassicRegressionCorrectiveIdsV1({
        audit,
        finalV2,
        preGpuV2,
        roleV1,
        finalV1,
        sourceSplitV1,
        rendererV1,
        publicationLedger: ledger,
      }),
    )
  )
    fail("non-deterministic-derivation");
  if (derivedIds.length !== 7) fail(`exact-set:${derivedIds.length}`);
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
  const rows: JuliaClassicRegressionCorrectiveRowV1[] = [];
  const dynamicInputs: string[] = [];
  for (const formulaId of derivedIds) {
    const pre = preGpu.get(formulaId),
      role = roles.get(formulaId),
      baselineFinal = finals.get(formulaId);
    const split = sourceSplit.get(formulaId),
      rendererRow = renderer.get(formulaId),
      runtimeRow = published.get(formulaId);
    if (
      !pre ||
      !role ||
      !baselineFinal ||
      !split ||
      !rendererRow ||
      !runtimeRow
    )
      fail(`missing:${formulaId}`);
    const candidatePath = split.isolation.candidateDefinitionPath;
    const candidateFile = safeFile(RESOURCES, candidatePath);
    const baselineFile = safeFile(PUBLISHED, runtimeRow.definitionPath);
    dynamicInputs.push(
      `resources/formula-library/v1/${candidatePath}`,
      `public/formula-library/v1/runtime/published/${runtimeRow.definitionPath}`,
    );
    const candidateSource = readText(candidateFile),
      baselineSource = readText(baselineFile);
    const candidateIr = parseFrmLikeV1(candidateSource),
      baselineIr = parseFrmLikeV1(baselineSource);
    if (!candidateIr.ok || !baselineIr.ok) fail(`parse:${formulaId}`);
    const candidateHash = await hashFrmLikeV1(candidateSource, candidateIr.ir);
    const baselineHash = await hashFrmLikeV1(baselineSource, baselineIr.ir);
    if (
      candidateHash.sourceRevision !== split.identity.candidateSourceRevision ||
      candidateHash.semanticHash !== split.identity.candidateSemanticHash ||
      baselineHash.sourceRevision !== runtimeRow.sourceRevision ||
      baselineHash.semanticHash !== runtimeRow.semanticHash ||
      baselineHash.sourceRevision !== split.baselineSourceRevision ||
      baselineHash.semanticHash !== split.baselineSemanticHash
    )
      fail(`hash:${formulaId}`);
    const safety = await validateFormulaSafetyEnvelopeV1({
      schemaVersion: 1,
      source: candidateSource,
      sourceRevision: candidateHash.sourceRevision,
      semanticHash: candidateHash.semanticHash,
      languageVersion: "frm-like/1",
      stdlibVersion: 1,
      supportedNumericProfiles: ["standard32"],
      parameters: candidateIr.ir.parameters,
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
    const classified = classifyJuliaBindingRolesV1(candidateIr.ir, binding, {
      source: candidateSource,
      sourceRevision: candidateHash.sourceRevision,
    });
    if (
      !classified.ok ||
      classified.contract.modeClass !== "classic-julia" ||
      classified.contract.z0Role !== "pixel-seed"
    )
      fail(`classify:${formulaId}`);
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
      fail(`cpu:${formulaId}`);
    const analysis = await analyzeJuliaPixelChangedRegionsV1(
      {
        formulaId,
        source: baselineSource,
        sourceRevision: baselineHash.sourceRevision,
        semanticHash: baselineHash.semanticHash,
        sourceAuthorityContentHash: parsedContract.value.contentHash,
        ir: baselineIr.ir,
      },
      {
        formulaId,
        source: candidateSource,
        sourceRevision: candidateHash.sourceRevision,
        semanticHash: candidateHash.semanticHash,
        sourceAuthorityContentHash: parsedContract.value.contentHash,
        ir: candidateIr.ir,
      },
    );
    if (!analysis.ok) fail(`e0-analysis:${formulaId}`);
    const coverage = verifyJuliaPixelChangedRegionCoverageV1(
      analysis.value,
      analysis.value.regions.map((region) => ({
        regionId: region.regionId,
        coveredModes: region.requiredCoverageModes,
      })),
    );
    if (!coverage.ok) fail(`e0-coverage:${formulaId}`);
    const row = {
      formulaId,
      baselineSourceRevision: baselineHash.sourceRevision,
      baselineSemanticHash: baselineHash.semanticHash,
      candidatePath,
      candidateSourceRevision: candidateHash.sourceRevision,
      candidateSemanticHash: candidateHash.semanticHash,
      binding,
      legacyBindingRevision: split.tier1.bindingRevision,
      correctiveBindingRevision: correctiveBindingRevision(
        formulaId,
        candidateHash.sourceRevision,
        binding,
      ),
      supportLane:
        split.rewrite.kind === "direct-pixel"
          ? ("source-split-direct" as const)
          : ("source-split-transitive" as const),
      reasonCode: pre.reasonCodes[0],
      e0: {
        operationalEquivalence: true as const,
        analyzerRevision: parsedContract.value.changedRegionAnalyzer.revision,
        analysisContentHash: analysis.value.contentHash,
        changedRegionCount: analysis.value.regions.length,
        reachableOrUnknownRegionCount:
          analysis.value.reachableOrUnknownRegionCount,
        coveredRegionCount: coverage.coveredRegionCount,
        uncoveredReachableOrUnknownRegionCount:
          coverage.uncoveredReachableOrUnknownRegionCount,
      },
      tier0: "pass" as const,
      tier1: "pass" as const,
      tier2: "pending-not-run" as const,
    };
    rows.push({
      ...row,
      rowReceipt: juliaClassicRegressionCorrectiveRowReceiptV1(row),
    });
  }
  rows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  const sourceBindings = Object.fromEntries(
    [...new Set([...sourceInputs, ...dynamicInputs])]
      .sort()
      .map((path) => [path, contentHash(safeFile(ROOT, path))]),
  );
  const assetWithoutHash = {
    schema: "fractalpark-julia-classic-regression-corrective/v1" as const,
    revision: 1 as const,
    stage: "pre-gpu-corrective-evidence-only" as const,
    activationStatus: "inactive-evidence-only" as const,
    tier2: "pending-not-run" as const,
    recoveryContractContentHash: parsedContract.value.contentHash,
    finalV2ContentHash: finalV2.contentHash,
    finalV2WholeFileSha256: contentHash(
      join(RESOURCES, "julia-pixel-final-capability-census.v2.json"),
    ),
    finalV2AuditContentHash: audit.contentHash,
    sourceBindings,
    rowCount: 7 as const,
    rows,
  };
  const asset = {
    ...assetWithoutHash,
    contentHash:
      juliaClassicRegressionCorrectiveContentHashV1(assetWithoutHash),
  };
  if (!parseJuliaClassicRegressionCorrectiveV1(asset).ok) fail("self-parse");
  return asset;
}

build()
  .then((asset) => {
    const temporary = `${OUTPUT}.tmp-${process.pid}`;
    writeFileSync(temporary, `${JSON.stringify(asset, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporary, OUTPUT);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
