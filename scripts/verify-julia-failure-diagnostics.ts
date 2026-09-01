import { spawnSync } from "node:child_process";
import { constants, chmodSync, closeSync, existsSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import existingAsset from "../resources/formula-library/v1/julia-existing-system-c-evidence.v1.json";
import candidateAsset from "../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import rendererAsset from "../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import splitAsset from "../resources/formula-library/v1/julia-source-split-evidence.v1.json";
import { runJuliaCpuHarnessV1, type JuliaCpuComplexV1 } from "../src/engine/formulas/v1/julia-cpu-harness";
import { JULIA_FAILURE_DIAGNOSTIC_EPSILON_V1, JULIA_FAILURE_DIAGNOSTIC_REVISION_V1, JULIA_FAILURE_DIAGNOSTIC_SOURCE_BINDING_PATHS_V1, projectJuliaCpuFailureV1, projectJuliaRendererFailureV1 } from "../src/engine/formulas/v1/julia-failure-diagnostics";
import type { JuliaRendererReportRowV1 } from "../src/engine/formulas/v1/julia-renderer-evidence";
import { parseJuliaPixelRecoveryCandidatesV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-candidates";
import {
  parseJuliaPreGpuCapabilityCensusV1,
  type JuliaPreGpuCapabilityRowV1,
} from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import { compilePublishedFormulaPluginV1 } from "../src/engine/formulas/v1/published-adapter";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import { proposeJuliaSourceSplitV1 } from "../src/engine/formulas/v1/julia-source-split";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import type { FrmV1UnaryFunctionName } from "../src/engine/frm/frm-v1-stdlib";
import { blackInsideColoring } from "../src/engine/plugins/builtins/coloring/inside-black";
import { smoothColoring } from "../src/engine/plugins/builtins/coloring/smooth";
import { noneTransform } from "../src/engine/plugins/builtins/transforms/none";
import { pluginRegistry } from "../src/engine/plugins/registry";
import { assembleShader } from "../src/engine/shaders/assembler";

const ROOT = process.cwd();
const RESOURCE = join(ROOT, "resources/formula-library/v1");
const RUNTIME = join(ROOT, "public/formula-library/v1/runtime/published");
const PRIVATE = join(ROOT, ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1/diagnostics-v1");
const RECEIPTS = join(PRIVATE, "receipts");
const MANIFESTS = join(PRIVATE, "manifests");
const SPLIT_DEFINITIONS = join(RESOURCE, "julia-source-split-candidates/definitions");
const fail = (code: string): never => { throw new Error(`verify-julia-failure-diagnostics:${code}`); };
const same = (left: unknown, right: unknown): boolean => canonicalJsonV1(left, 10_000_000) === canonicalJsonV1(right, 10_000_000);
const hashFile = (path: string): string => sha256HexSyncV1(readFileSync(path, "utf8"));
const contentHash = (value: Record<string, unknown>): string => sha256HexSyncV1(canonicalJsonV1(value, 1_048_576));

type RuntimeParameter = number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName;
type WorkerOutput = Readonly<{ ok: true; rendererClass: "SwiftShader-software"; rows: readonly JuliaRendererReportRowV1[] }>;
type CompileOutput = Readonly<{ ok: true; rendererClass: "SwiftShader-software"; rowCount: 8; rows: readonly Readonly<{ formulaId: string; fullShaderSha256: string; compileLink: boolean; failureCode: string | null }>[] }>;
type PreGpuRow = JuliaPreGpuCapabilityRowV1;
interface CpuPrepared {
  readonly formulaId: string;
  readonly fullShaderSha256: string;
  readonly fullShader: string;
  readonly preGpu: PreGpuRow;
  readonly historical: { artifactContentHash: string; reasonCodes: readonly string[] };
  readonly cpuProjection: ReturnType<typeof projectJuliaCpuFailureV1>;
  readonly epsilonProjection: Readonly<{
    epsilon: "2^-20";
    gridContentHash: string;
    checks: Readonly<Record<string, boolean>>;
    reasonCodes: readonly string[];
  }>;
}

function runtimeParameters(parameters: readonly { slotName: string; type: string; default: unknown }[]): Readonly<Record<string, RuntimeParameter>> {
  return Object.freeze(Object.fromEntries(parameters.map((parameter) => {
    if (parameter.type !== "complex") return [parameter.slotName, parameter.default as number | FrmV1UnaryFunctionName];
    const value = parameter.default as readonly number[];
    return [parameter.slotName, [value[0]!, value[1]!] as JuliaCpuComplexV1];
  })));
}

function sourceBindings(extraPaths: readonly string[] = []): Record<string, string> {
  return Object.fromEntries(
    [...new Set([
      ...JULIA_FAILURE_DIAGNOSTIC_SOURCE_BINDING_PATHS_V1,
      ...extraPaths,
    ])]
      .sort()
      .map((path) => [path, hashFile(join(ROOT, path))]),
  );
}

function parseLastJson<T>(output: string, code: string): T {
  try { return JSON.parse(output.trim().split("\n").at(-1) ?? "{}") as T; }
  catch { return fail(code); }
}

function bundle(source: string, output: string): void {
  const result = spawnSync(join(ROOT, "node_modules/.bin/esbuild"), [source, "--bundle", "--platform=node", "--format=esm", "--loader:.glsl=text", "--packages=external", `--outfile=${output}`], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  if (result.status !== 0) fail("worker-bundle-failed");
}

function runWorkers(
  rendererIds: readonly string[],
  compileCases: readonly { formulaId: string; fullShaderSha256: string; fullShader: string }[],
): { renderer: WorkerOutput; compile: CompileOutput } {
  const temporary = mkdtempSync(join(tmpdir(), "fractalpark-julia-diagnosis-"));
  chmodSync(temporary, 0o700);
  const rendererPayload = join(temporary, "renderer.json");
  const compilePayload = join(temporary, "compile.json");
  const rendererBundle = join(ROOT, "node_modules/.cache/julia-failure-diagnostic-worker.mjs");
  const compileBundle = join(ROOT, "node_modules/.cache/julia-compile-probe-worker.mjs");
  try {
    writeFileSync(rendererPayload, `${JSON.stringify({ ids: rendererIds })}\n`, { mode: 0o600 });
    writeFileSync(compilePayload, `${JSON.stringify({ cases: compileCases })}\n`, { mode: 0o600 });
    bundle("scripts/run-julia-failure-diagnostic-worker.ts", rendererBundle);
    bundle("scripts/run-julia-compile-probe-worker.ts", compileBundle);
    const rendererRun = spawnSync(process.execPath, [rendererBundle, rendererPayload], { cwd: ROOT, encoding: "utf8", timeout: 900_000, maxBuffer: 16 * 1024 * 1024 });
    if (rendererRun.status !== 0) fail("renderer-worker-failed");
    const compileRun = spawnSync(process.execPath, [compileBundle, compilePayload], { cwd: ROOT, encoding: "utf8", timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
    if (compileRun.status !== 0) fail("compile-worker-failed");
    const renderer = parseLastJson<WorkerOutput>(String(rendererRun.stdout), "renderer-output-invalid");
    const compile = parseLastJson<CompileOutput>(String(compileRun.stdout), "compile-output-invalid");
    if (renderer.ok !== true || renderer.rendererClass !== "SwiftShader-software" || renderer.rows.length !== 15) fail("renderer-output-invalid");
    if (compile.ok !== true || compile.rendererClass !== "SwiftShader-software" || compile.rows.length !== 8) fail("compile-output-invalid");
    return { renderer, compile };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    rmSync(rendererBundle, { force: true });
    rmSync(compileBundle, { force: true });
  }
}

function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) fail("private-output-missing");
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o700) fail("private-directory-invalid");
}

function privateOutputReady(): void {
  const ignored = spawnSync("git", ["check-ignore", "-q", ".formula-library-private/"], { cwd: ROOT });
  if (ignored.status !== 0) fail("private-root-not-ignored");
  const components = [join(ROOT, ".formula-library-private"), join(ROOT, ".formula-library-private/formula-library-v1"), join(ROOT, ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1"), PRIVATE, RECEIPTS, MANIFESTS];
  for (const component of components) ensurePrivateDirectory(component);
  const realRoot = realpathSync(ROOT);
  if (!realpathSync(PRIVATE).startsWith(`${realRoot}/.formula-library-private/`)) fail("private-root-escape");
}

function readAndVerify(path: string, expectedBytes: string): void {
  if (!existsSync(path)) fail("private-artifact-missing");
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    const current = lstatSync(path);
    const bytes = readFileSync(descriptor, "utf8");
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      (opened.mode & 0o777) !== 0o600 ||
      !current.isFile() ||
      current.isSymbolicLink() ||
      current.nlink !== 1 ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      bytes !== expectedBytes
    )
      fail("private-artifact-invalid");
  } finally { closeSync(descriptor); }
}

async function main(): Promise<void> {
  pluginRegistry.register(smoothColoring);
  pluginRegistry.register(blackInsideColoring);
  pluginRegistry.register(noneTransform);
  const runtimeResult = parsePublishedFormulaRuntimeIndexV1(JSON.parse(readFileSync(join(RUNTIME, "index.json"), "utf8")));
  const preGpuResult = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
  const candidateResult = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
  const runtime = runtimeResult.ok ? runtimeResult.value : fail("runtime-input-invalid");
  const preGpuAssetParsed = preGpuResult.ok ? preGpuResult.value : fail("pre-gpu-input-invalid");
  const candidates = candidateResult.ok ? candidateResult.value : fail("candidate-input-invalid");
  const runtimeById = new Map(runtime.rows.map((row) => [row.formulaId, row]));
  const preGpuById = new Map(preGpuAssetParsed.rows.map((row) => [row.formulaId, row]));
  const candidateById = new Map(candidates.rows.map((row) => [row.formulaId, row]));
  const cpuHistorical = new Map<string, { artifactContentHash: string; reasonCodes: readonly string[] }>();
  for (const row of existingAsset.rows)
    if (row.tier1?.status === "blocked") cpuHistorical.set(row.formulaId, { artifactContentHash: existingAsset.contentHash, reasonCodes: row.tier1.reasonCodes });
  for (const row of splitAsset.rows)
    if (row.status === "blocked" && row.tier1) cpuHistorical.set(row.formulaId, { artifactContentHash: splitAsset.contentHash, reasonCodes: row.tier1.reasonCodes });
  const rendererHistorical = new Map(rendererAsset.rows.filter((row) => row.status === "blocked").map((row) => [row.formulaId, row]));
  const cpuIds = [...cpuHistorical.keys()].sort();
  const rendererIds = [...rendererHistorical.keys()].sort();
  if (cpuIds.length !== 8 || rendererIds.length !== 15 || cpuIds.some((id) => rendererHistorical.has(id))) fail("target-set-invalid");
  const targetIds = [...cpuIds, ...rendererIds].sort();
  if (targetIds.length !== 23 || new Set(targetIds).size !== 23)
    fail("target-union-invalid");
  const evaluatedSourcePaths = new Set<string>();
  for (const formulaId of targetIds) {
    const runtimeRow = runtimeById.get(formulaId) ?? fail("runtime-row-missing");
    const preGpuRow = preGpuById.get(formulaId) ?? fail("pre-gpu-row-missing");
    evaluatedSourcePaths.add(
      `public/formula-library/v1/runtime/published/${runtimeRow.definitionPath}`,
    );
    if (preGpuRow.lane === "source-split") {
      const relativeCandidate = `resources/formula-library/v1/julia-source-split-candidates/definitions/${preGpuRow.evaluatedSourceRevision}.frm`;
      if (existsSync(join(ROOT, relativeCandidate)))
        evaluatedSourcePaths.add(relativeCandidate);
    }
  }
  const dCandidateCpu = cpuIds.filter((formulaId) => {
    const row = candidateById.get(formulaId);
    const preGpuRow = preGpuById.get(formulaId);
    return (
      row?.status === "candidate" &&
      row.candidate.sourceRevision === preGpuRow?.evaluatedSourceRevision
    );
  }).length;
  const dCandidateRenderer = rendererIds.filter((formulaId) => {
    const row = candidateById.get(formulaId);
    const historical = rendererHistorical.get(formulaId);
    return (
      row?.status === "candidate" &&
      row.candidate.sourceRevision === historical?.evaluatedSourceRevision
    );
  }).length;
  if (dCandidateCpu !== 4 || dCandidateRenderer !== 12)
    fail("candidate-overlap-invalid");
  const targetIdsContentHash = contentHash({ cpuIds, rendererIds });
  const initialBindings = sourceBindings([...evaluatedSourcePaths]);

  const cpuPrepared: CpuPrepared[] = [];
  for (const formulaId of cpuIds) {
    const runtime = runtimeById.get(formulaId) ?? fail("runtime-row-missing");
    const preGpu = preGpuById.get(formulaId) ?? fail("pre-gpu-row-missing");
    const historical = cpuHistorical.get(formulaId)!;
    if (preGpu.disposition !== "existing-system-c-tier1-blocked" && preGpu.disposition !== "source-split-tier1-blocked") fail("cpu-disposition-invalid");
    const baselineSource = readFileSync(join(RUNTIME, runtime.definitionPath), "utf8");
    const baselineParsed = parseFrmLikeV1(baselineSource);
    const baselineIr = baselineParsed.ok ? baselineParsed.ir : fail("cpu-baseline-invalid");
    let source = baselineSource;
    if (preGpu.lane === "source-split") {
      const candidatePath = join(
        SPLIT_DEFINITIONS,
        `${preGpu.evaluatedSourceRevision}.frm`,
      );
      if (existsSync(candidatePath)) source = readFileSync(candidatePath, "utf8");
      else {
        const proposalResult = proposeJuliaSourceSplitV1(baselineIr);
        const proposal = proposalResult.ok
          ? proposalResult
          : fail("cpu-source-reconstruction-invalid");
        if (proposal.sourceRevision !== preGpu.evaluatedSourceRevision)
          fail("cpu-source-reconstruction-invalid");
        source = proposal.source;
      }
    }
    const parsedResult = parseFrmLikeV1(source);
    const ir = parsedResult.ok ? parsedResult.ir : fail("cpu-source-invalid");
    const revision = await hashFrmLikeV1(source, ir);
    if (
      revision.sourceRevision !== preGpu.evaluatedSourceRevision ||
      revision.semanticHash !== preGpu.evaluatedSemanticHash
    )
      fail("cpu-source-binding-invalid");
    const binding = preGpu.lane === "source-split" ? { kind: "source-split" as const, sourceRevision: preGpu.evaluatedSourceRevision } : { kind: "system-c" as const };
    const options = {
      ...(preGpu.lane === "source-split" ? { sourceBinding: { source, sourceRevision: preGpu.evaluatedSourceRevision }, parameterPlaneBaseline: { source: baselineSource, sourceRevision: preGpu.baselineSourceRevision } } : {}),
      parameters: runtimeParameters(runtime.parameters),
    };
    const harnessResult = runJuliaCpuHarnessV1(ir, binding, options);
    const harness = harnessResult.ok ? harnessResult.value : fail("cpu-replay-invalid");
    if (harness.candidatePass || !same(harness.reasonCodes, historical.reasonCodes)) fail("cpu-replay-invalid");
    const epsilonPoints = harness.points.map(([re, im]) => [re + JULIA_FAILURE_DIAGNOSTIC_EPSILON_V1, im - JULIA_FAILURE_DIAGNOSTIC_EPSILON_V1] as const);
    const epsilonConstants = harness.constants.map(([re, im]) => [re - JULIA_FAILURE_DIAGNOSTIC_EPSILON_V1, im + JULIA_FAILURE_DIAGNOSTIC_EPSILON_V1] as const);
    const epsilonResult = runJuliaCpuHarnessV1(ir, binding, { ...options, points: epsilonPoints, constants: epsilonConstants });
    const epsilonHarness = epsilonResult.ok ? epsilonResult.value : fail("cpu-epsilon-replay-invalid");
    const compiledResult = await compilePublishedFormulaPluginV1({ formulaId, displayName: runtime.displayName, family: runtime.family, sourceRevision: preGpu.evaluatedSourceRevision, semanticHash: preGpu.evaluatedSemanticHash, source });
    const compiled = compiledResult.ok ? compiledResult.value : fail("cpu-production-compile-invalid");
    const fullShader = assembleShader({ formulaId, outsideColoringId: "smooth", insideColoringId: "black", transformId: "none", pipelineVersion: 2 }, compiled.plugin);
    cpuPrepared.push({
      formulaId,
      fullShader,
      fullShaderSha256: sha256HexSyncV1(fullShader),
      preGpu,
      historical,
      cpuProjection: projectJuliaCpuFailureV1(harness),
      epsilonProjection: {
        epsilon: "2^-20",
        gridContentHash: contentHash({ points: epsilonPoints, constants: epsilonConstants }),
        checks: epsilonHarness.checks,
        reasonCodes: epsilonHarness.reasonCodes,
      },
    });
  }

  const workers = runWorkers(rendererIds, cpuPrepared.map(({ formulaId, fullShaderSha256, fullShader }) => ({ formulaId, fullShaderSha256, fullShader })));
  const compileById = new Map(workers.compile.rows.map((row) => [row.formulaId, row]));
  const rendererById = new Map(workers.renderer.rows.map((row) => [row.formulaId, row]));
  if (compileById.size !== 8 || rendererById.size !== 15) fail("worker-row-set-invalid");
  const bindings = sourceBindings([...evaluatedSourcePaths]);
  if (!same(bindings, initialBindings)) fail("source-binding-concurrency-drift");
  const bindingsHash = contentHash(bindings);
  const receiptRows: Record<string, unknown>[] = [];
  const receiptBytes = new Map<string, string>();

  for (const prepared of cpuPrepared) {
    const formulaId = prepared.formulaId;
    const preGpu = prepared.preGpu;
    const historical = prepared.historical;
    const compile = compileById.get(formulaId) ?? fail("compile-row-missing");
    if (compile.fullShaderSha256 !== prepared.fullShaderSha256 || !compile.compileLink) fail("compile-probe-invalid");
    const dRow = candidateById.get(formulaId);
    const body: Record<string, unknown> = {
      schema: "fractalpark-julia-failure-diagnosis-receipt/v1",
      revision: 1,
      authorityState: "draft-diagnosis-only",
      formulaId,
      failureTier: "tier1-cpu",
      historicalEvidence: { artifactContentHash: historical.artifactContentHash, sourceRevision: preGpu.evaluatedSourceRevision, semanticHash: preGpu.evaluatedSemanticHash, bindingRevision: preGpu.bindingRevision, lane: preGpu.lane, reasonCodes: historical.reasonCodes },
      dCandidateRelation: { status: dRow?.status ?? null, sourceRevisionMatches: dRow?.status === "candidate" && dRow.candidate.sourceRevision === preGpu.evaluatedSourceRevision },
      strictF32Diagnostic: prepared.cpuProjection,
      epsilonDiagnostic: prepared.epsilonProjection,
      productionProbe: { rendererClass: "SwiftShader-software", assembledShaderSha256: prepared.fullShaderSha256, compileLink: true },
      diagnosis: { defectOwner: "cpu-standard32-candidate-semantics", repairTrack: "undetermined-shared-vs-formula", notApplicable: false, fixAuthorized: false },
      sourceBindingsContentHash: bindingsHash,
      candidateSetState: "draft-not-wave-frozen",
      waveId: null,
    };
    const hash = contentHash(body);
    const receipt = { ...body, contentHash: hash };
    receiptBytes.set(hash, `${JSON.stringify(receipt, null, 2)}\n`);
    receiptRows.push({ formulaId, failureTier: "tier1-cpu", historicalReasonCode: historical.reasonCodes.join("+"), diagnosisClass: (prepared.cpuProjection as ReturnType<typeof projectJuliaCpuFailureV1>).reasonCodes.join("+"), receiptContentHash: hash });
  }

  for (const formulaId of rendererIds) {
    const historical = rendererHistorical.get(formulaId)!;
    const observed = rendererById.get(formulaId) ?? fail("renderer-row-missing");
    const observedClass = observed.reasonCode?.split(":", 1)[0] ?? null;
    if (observed.status !== "blocked" || observedClass !== historical.reasonCode || observed.evaluatedSourceRevision !== historical.evaluatedSourceRevision || observed.bindingRevision !== historical.bindingRevision || observed.profileDigest !== historical.profileDigest) fail("renderer-replay-invalid");
    const dRow = candidateById.get(formulaId);
    const projection = projectJuliaRendererFailureV1(observed.reasonCode!);
    const body: Record<string, unknown> = {
      schema: "fractalpark-julia-failure-diagnosis-receipt/v1",
      revision: 1,
      authorityState: "draft-diagnosis-only",
      formulaId,
      failureTier: "tier2-renderer",
      historicalEvidence: { artifactContentHash: rendererAsset.contentHash, sourceRevision: historical.evaluatedSourceRevision, semanticHash: historical.evaluatedSemanticHash, bindingRevision: historical.bindingRevision, profileDigest: historical.profileDigest, lane: historical.lane, reasonCode: historical.reasonCode },
      dCandidateRelation: { status: dRow?.status ?? null, sourceRevisionMatches: dRow?.status === "candidate" && dRow.candidate.sourceRevision === historical.evaluatedSourceRevision },
      productionProbe: { rendererClass: "SwiftShader-software", fullFrameworkCompileLink: observed.fullFrameworkCompileLink, deterministicDoubleDraw: observed.deterministicDoubleDraw, firstFailure: projection },
      diagnosis: { defectOwner: projection.surface === "image-constant-sensitivity" ? "renderer-image-constant-path" : "renderer-native-parity-path", repairTrack: "shared-renderer-vs-formula-undetermined", notApplicable: false, fixAuthorized: false },
      sourceBindingsContentHash: bindingsHash,
      candidateSetState: "draft-not-wave-frozen",
      waveId: null,
    };
    const hash = contentHash(body);
    const receipt = { ...body, contentHash: hash };
    receiptBytes.set(hash, `${JSON.stringify(receipt, null, 2)}\n`);
    receiptRows.push({ formulaId, failureTier: "tier2-renderer", historicalReasonCode: historical.reasonCode, diagnosisClass: projection.rawFailureCode, receiptContentHash: hash });
  }
  receiptRows.sort((left, right) => String(left.formulaId).localeCompare(String(right.formulaId)));
  if (
    receiptRows.length !== targetIds.length ||
    receiptRows.some((row, index) => row.formulaId !== targetIds[index])
  )
    fail("receipt-target-set-invalid");
  const manifestBody: Record<string, unknown> = {
    schema: "fractalpark-julia-failure-diagnosis-manifest/v1",
    revision: 1,
    stage: "tier1-tier2-diagnosis",
    authorityState: "draft-diagnosis-only",
    candidateSetState: "draft-not-wave-frozen",
    waveId: null,
    diagnosticRevision: JULIA_FAILURE_DIAGNOSTIC_REVISION_V1,
    inputArtifactHashes: { existingSystemC: existingAsset.contentHash, sourceSplit: splitAsset.contentHash, preGpu: preGpuAssetParsed.contentHash, renderer: rendererAsset.contentHash, recoveryCandidates: candidates.contentHash },
    sourceBindings: bindings,
    sourceBindingsContentHash: bindingsHash,
    targetIdsContentHash,
    targetCounts: { cpuNonFinite: 2, cpuSensitivity: 6, renderer: 15, totalUnique: targetIds.length },
    overlapCounts: { dCandidateCpu, dCandidateRenderer, cpuRenderer: 0 },
    policy: { traceDepths: "1,2,4,8,16,32,64,128", traceStateDimensions: 18, imageComparisons: 96, relativeTolerance: 0.005, perIdThresholdCount: 0, whitelistCount: 0, fixAuthorized: false },
    rows: receiptRows,
  };
  const manifestHash = contentHash(manifestBody);
  const manifest = { ...manifestBody, contentHash: manifestHash };
  privateOutputReady();
  for (const [hash, bytes] of receiptBytes) readAndVerify(join(RECEIPTS, `${hash}.json`), bytes);
  readAndVerify(join(MANIFESTS, `${manifestHash}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, manifestContentHash: manifestHash, receiptCount: receiptRows.length, cpuCount: 8, rendererCount: 15, independentlyReplayed: true })}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: error instanceof Error ? error.message.split(":", 2).join(":") : "julia-failure-diagnosis-failed" })}\n`);
  process.exitCode = 1;
});
