import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import activationAsset from "../resources/formula-library/v1/julia-runtime-activation.v1.json";
import classicCorrectiveAsset from "../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import classicRendererAsset from "../resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json";
import mutableAsset from "../resources/formula-library/v1/julia-mutable-state-adjudication.v1.json";
import rendererV1Asset from "../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import rendererV2Asset from "../resources/formula-library/v1/julia-renderer-evidence.v2.json";
import { juliaMutableStateRendererTupleReceiptV1 } from "../src/engine/formulas/v1/julia-mutable-state-adjudication-v1";

const ROOT = resolve(process.cwd());
const CACHE = join(ROOT, "node_modules", ".cache");
const GATE_PATH = join(ROOT, "scripts", "verify-julia-activation-webgl1-release.ts");
const ACTIVATION_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-runtime-activation.v1.json",
);
const RENDERER_V1_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
);
const RENDERER_V2_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-renderer-evidence.v2.json",
);
const CLASSIC_RENDERER_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json",
);
const MUTABLE_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-mutable-state-adjudication.v1.json",
);
const REPORT_SCHEMA = "fractalpark-julia-activation-webgl1-release-report/v1";
const GIT_SHA = /^[0-9a-f]{40}$/;
const EXPECTED_ACTIVATION_COUNT = 195;
const EXPECTED_MAIN_COUNT = 179;
const EXPECTED_CORRECTIVE_COUNT = 7;
const EXPECTED_REUSED_COUNT = 9;

type Lane = "main" | "corrective";
type RecordValue = Record<string, unknown>;

interface Coverage {
  readonly activationIds: readonly string[];
  readonly mainIds: readonly string[];
  readonly correctiveIds: readonly string[];
  readonly reusedIds: readonly string[];
}

interface ReleaseReport {
  readonly schema: typeof REPORT_SCHEMA;
  readonly candidateGitSha: string;
  readonly activationContentHash: string;
  readonly activationAssetSha256: string;
  readonly lane: Lane;
  readonly laneAuthorityContentHash: string;
  readonly laneAuthorityAssetSha256: string;
  readonly reusedMutableAssetSha256: string;
  readonly reusedRendererV1AssetSha256: string;
  readonly reusedTupleSetSha256: string;
  readonly reusedFormulaIds: readonly string[];
  readonly start: number;
  readonly count: number;
  readonly fullLaneCount: number;
  readonly gateSourceSha256: string;
  readonly sourceWorkerSha256: string;
  readonly transformedWorkerSha256: string;
  readonly renderer: string;
  readonly maximumRelativeError: number;
  readonly formulaIds: readonly string[];
  readonly rows: readonly RecordValue[];
}

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`julia-activation-webgl1-release:${code}`);
}

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortedUnique(values: readonly string[], code: string): readonly string[] {
  const sorted = [...values].sort();
  invariant(new Set(sorted).size === sorted.length, `${code}-duplicate`);
  return sorted;
}

function exactSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function validateReusedTuple(
  row: RecordValue,
  baseline: RecordValue | undefined,
  activation: RecordValue | undefined,
): void {
  invariant(typeof row.formulaId === "string", "reused-formula-id");
  invariant(baseline?.status === "passed", "reused-webgl1-pass");
  invariant(activation?.formulaId === row.formulaId, "reused-activation-row");
  invariant(
    activation.sourceRevision === row.baselineSourceRevision,
    "reused-activation-source",
  );
  invariant(record(row.binding), "reused-binding");
  invariant(
    row.binding.sourceRevision === row.candidateSourceRevision &&
      baseline.evaluatedSourceRevision === row.candidateSourceRevision &&
      baseline.evaluatedSemanticHash === row.candidateSemanticHash &&
      baseline.bindingRevision === row.legacyBindingRevision &&
      baseline.profileDigest === row.rendererProfileDigest,
    "reused-renderer-tuple",
  );
  invariant(
    row.rendererTupleReceipt ===
      juliaMutableStateRendererTupleReceiptV1({
        rendererContentHash: rendererV1Asset.contentHash,
        formulaId: row.formulaId,
        evaluatedSourceRevision: baseline.evaluatedSourceRevision,
        evaluatedSemanticHash: baseline.evaluatedSemanticHash,
        bindingRevision: baseline.bindingRevision,
        profileDigest: baseline.profileDigest,
        status: baseline.status,
        rendererClass: baseline.rendererClass,
        fullFrameworkCompileLink: baseline.fullFrameworkCompileLink,
        deterministicDoubleDraw: baseline.deterministicDoubleDraw,
        traceDepthComparisons: baseline.traceDepthComparisons,
        imagePixelComparisons: baseline.imagePixelComparisons,
        relativeTolerance: baseline.relativeTolerance,
      }),
    "reused-renderer-receipt",
  );
  invariant(row.tier2 === "reused-pass-exact-tuple", "reused-tier2");
  invariant(record(row.stateSeparation), "reused-state-separation-shape");
  invariant(
    row.stateSeparation.operationalEquivalence === true &&
      row.stateSeparation.frozenTargetsNotWritten === true &&
      row.stateSeparation.frozenTargetsLiveInLoop === true &&
      row.stateSeparation.baselineMutableSurfaceDisjointFromFrozenTargets ===
        true &&
      row.stateSeparation.candidateMutableSurfaceDisjointFromFrozenTargets ===
        true &&
      row.stateSeparation.systemCNotWrittenInLoop === true &&
      row.stateSeparation.parameterPlaneBitIdentical === true &&
      row.stateSeparation.juliaFullStateDeterministic === true,
    "reused-state-separation",
  );
}

export function buildCoverage(): Coverage {
  const activationIds = sortedUnique(
    activationAsset.rows.map((row) => row.formulaId),
    "activation",
  );
  const mainIds = sortedUnique(
    rendererV2Asset.rows
      .filter((row) => row.status === "passed")
      .map((row) => row.formulaId),
    "main",
  );
  const correctiveIds = sortedUnique(
    classicRendererAsset.rows
      .filter((row) => row.status === "passed")
      .map((row) => row.formulaId),
    "corrective",
  );
  const reusedIds = sortedUnique(
    mutableAsset.rows.map((row) => row.formulaId),
    "reused",
  );

  invariant(
    activationAsset.supportedCount === EXPECTED_ACTIVATION_COUNT &&
      activationIds.length === EXPECTED_ACTIVATION_COUNT,
    "activation-count",
  );
  invariant(mainIds.length === EXPECTED_MAIN_COUNT, "main-count");
  invariant(
    correctiveIds.length === EXPECTED_CORRECTIVE_COUNT,
    "corrective-count",
  );
  invariant(reusedIds.length === EXPECTED_REUSED_COUNT, "reused-count");

  const correctiveById = new Map(
    classicCorrectiveAsset.rows.map((row) => [row.formulaId, row]),
  );
  for (const row of classicRendererAsset.rows) {
    const corrective = correctiveById.get(row.formulaId);
    invariant(
      corrective !== undefined &&
        row.candidateContentHash === corrective.rowReceipt &&
        row.evaluatedSourceRevision === corrective.candidateSourceRevision &&
        row.evaluatedSemanticHash === corrective.candidateSemanticHash &&
        row.bindingRevision === corrective.correctiveBindingRevision &&
        row.supportLane === corrective.supportLane &&
        JSON.stringify(row.binding) === JSON.stringify(corrective.binding),
      `corrective-authority:${row.formulaId}`,
    );
  }

  const unionIds = sortedUnique(
    [...mainIds, ...correctiveIds, ...reusedIds],
    "lane-union",
  );
  invariant(exactSet(unionIds, activationIds), "activation-lane-gap");

  const rendererV1ById = new Map(
    rendererV1Asset.rows.map((row) => [row.formulaId, row]),
  );
  const activationById = new Map(
    activationAsset.rows.map((row) => [row.formulaId, row]),
  );
  for (const row of mutableAsset.rows) {
    validateReusedTuple(
      row as unknown as RecordValue,
      rendererV1ById.get(row.formulaId) as unknown as RecordValue | undefined,
      activationById.get(row.formulaId) as unknown as RecordValue | undefined,
    );
  }

  return { activationIds, mainIds, correctiveIds, reusedIds };
}

function reusedTupleSetSha256(coverage: Coverage): string {
  const mutableById = new Map(mutableAsset.rows.map((row) => [row.formulaId, row]));
  const rendererById = new Map(rendererV1Asset.rows.map((row) => [row.formulaId, row]));
  const activationById = new Map(
    activationAsset.rows.map((row) => [row.formulaId, row]),
  );
  const tuples = coverage.reusedIds.map((formulaId) => ({
    formulaId,
    adjudication: mutableById.get(formulaId),
    rendererEvidence: rendererById.get(formulaId),
    activation: activationById.get(formulaId),
  }));
  invariant(
    tuples.every(
      (tuple) =>
        tuple.adjudication !== undefined &&
        tuple.rendererEvidence !== undefined &&
        tuple.activation !== undefined,
    ),
    "reused-tuple-incomplete",
  );
  return sha256(JSON.stringify(tuples));
}

function replaceOnce(source: string, before: string, after: string, code: string): string {
  const first = source.indexOf(before);
  invariant(first >= 0, `${code}-missing`);
  invariant(source.indexOf(before, first + before.length) < 0, `${code}-multiple`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

export function transformWorker(source: string): string {
  let transformed = replaceOnce(
    source,
    'canvas.getContext("webgl2", {',
    'canvas.getContext("webgl", {',
    "context",
  );
  transformed = replaceOnce(
    transformed,
    'if (!gl) throw new Error("webgl2-unavailable");',
    'if (!gl) throw new Error("webgl-unavailable");',
    "availability",
  );
  transformed = replaceOnce(
    transformed,
    '      if (!gl.getExtension("EXT_color_buffer_float"))\n        throw new Error("ext-color-buffer-float-unavailable");\n',
    '      if (!gl.getExtension("OES_texture_float"))\n        throw new Error("oes-texture-float-unavailable");\n      if (!gl.getExtension("WEBGL_color_buffer_float"))\n        throw new Error("webgl-color-buffer-float-unavailable");\n',
    "float-extension",
  );
  transformed = replaceOnce(
    transformed,
    "          gl.RGBA32F,",
    "          gl.RGBA,",
    "texture-internal-format",
  );
  invariant(!transformed.includes('getContext("webgl2"'), "webgl2-residual");
  invariant(!transformed.includes("gl.RGBA32F"), "rgba32f-residual");
  return transformed;
}

export function validateReportRow(
  row: RecordValue,
  expectedFormulaId: string,
  authorityRow: RecordValue | undefined,
): number {
  invariant(authorityRow?.status === "passed", "report-authority-row");
  invariant(
    row.status === "passed" &&
      row.formulaId === expectedFormulaId &&
      row.reasonCode === null,
    "report-row-status",
  );
  for (const field of [
    "candidateContentHash",
    "evaluatedSourceRevision",
    "evaluatedSemanticHash",
    "bindingRevision",
    "supportLane",
    "profileDigest",
    "fullFrameworkCappedDraw",
  ] as const) {
    invariant(row[field] === authorityRow[field], `report-row-authority:${field}`);
  }
  invariant(
    JSON.stringify(row.binding) === JSON.stringify(authorityRow.binding),
    "report-row-authority:binding",
  );
  invariant(
    row.rendererClass === "SwiftShader-software" &&
      row.fullFrameworkCompileLink === true &&
      row.deterministicDoubleDraw === true &&
      row.traceOrbitSteps === 128 &&
      row.traceStateDimensions === 18 &&
      row.traceStateComparisons === 2_304 &&
      row.traceFlagComparisons === 2_304 &&
      row.imagePixelComparisons === 96,
    "report-row-renderer-contract",
  );
  const differingPixels = Number(row.observedImageDifferingPixels);
  const minimumDifferingPixels = Number(authorityRow.minimumImageDifferingPixels);
  invariant(
    Number.isSafeInteger(differingPixels) &&
      differingPixels >= minimumDifferingPixels,
    "report-row-image-sensitivity",
  );
  const error = Number(row.observedMaximumRelativeError);
  const tolerance = Number(authorityRow.relativeTolerance);
  invariant(
    Number.isFinite(error) &&
      error >= 0 &&
      Number.isFinite(tolerance) &&
      error <= tolerance,
    "report-row-relative-error",
  );
  return error;
}

function laneDefinition(lane: Lane, coverage: Coverage) {
  if (lane === "main") {
    return {
      ids: coverage.mainIds,
      workerPath: join(ROOT, "scripts", "run-julia-tier2-webgl-worker-v2.ts"),
      authorityPath: RENDERER_V2_PATH,
      authorityContentHash: rendererV2Asset.contentHash,
    };
  }
  return {
    ids: coverage.correctiveIds,
    workerPath: join(
      ROOT,
      "scripts",
      "run-julia-classic-regression-tier2-webgl-worker-v1.ts",
    ),
    authorityPath: CLASSIC_RENDERER_PATH,
    authorityContentHash: classicRendererAsset.contentHash,
  };
}

function numericFlag(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!argument) return fallback;
  const value = Number(argument.slice(prefix.length));
  invariant(Number.isSafeInteger(value) && value >= 0, `${name}-invalid`);
  return value;
}

function stringFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function candidateGitSha(): string {
  const value =
    stringFlag("candidate-sha") ?? process.env.FRACTALPARK_RELEASE_CANDIDATE_SHA;
  invariant(typeof value === "string" && GIT_SHA.test(value), "candidate-sha-invalid");
  return value;
}

function parseLane(): Lane | undefined {
  const value = stringFlag("lane");
  if (value === undefined) return undefined;
  invariant(value === "main" || value === "corrective", "lane-invalid");
  return value;
}

function parseWorkerOutput(stdout: string): RecordValue {
  const lines = stdout.trim().split("\n").filter(Boolean);
  invariant(lines.length > 0, "worker-output-empty");
  const parsed: unknown = JSON.parse(lines.at(-1) ?? "null");
  invariant(record(parsed), "worker-output-invalid");
  return parsed;
}

function runLane(lane: Lane, coverage: Coverage): ReleaseReport {
  const definition = laneDefinition(lane, coverage);
  const start = numericFlag("start", 0);
  const limit = numericFlag("limit", definition.ids.length - start);
  invariant(start < definition.ids.length, "start-out-of-range");
  invariant(limit > 0 && start + limit <= definition.ids.length, "limit-out-of-range");
  const candidateSha = candidateGitSha();
  const ids = definition.ids.slice(start, start + limit);

  const source = readFileSync(definition.workerPath, "utf8");
  const transformed = transformWorker(source);
  mkdirSync(CACHE, { recursive: true });
  const temporaryRoot = mkdtempSync(join(CACHE, "julia-webgl1-"));
  const bundle = join(temporaryRoot, "worker.mjs");
  const payload = join(temporaryRoot, "payload.json");
  try {
    writeFileSync(payload, `${JSON.stringify({ ids })}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    const esbuild = spawnSync(
      join(ROOT, "node_modules", ".bin", "esbuild"),
      [
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--loader=ts",
        "--loader:.glsl=text",
        "--packages=external",
        `--sourcefile=${definition.workerPath}`,
        `--outfile=${bundle}`,
      ],
      {
        cwd: dirname(definition.workerPath),
        encoding: "utf8",
        input: transformed,
        timeout: 120_000,
      },
    );
    invariant(esbuild.status === 0, "bundle-failed");
    const worker = spawnSync(process.execPath, [bundle, payload], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 7_200_000,
    });
    invariant(worker.status === 0, "worker-failed");
    const output = parseWorkerOutput(worker.stdout);
    invariant(output.ok === true, "worker-not-ok");
    invariant(
      typeof output.renderer === "string" && output.renderer.includes("SwiftShader"),
      "renderer-invalid",
    );
    invariant(Array.isArray(output.rows), "worker-rows-invalid");
    const rows = output.rows as unknown[];
    invariant(rows.length === ids.length, "worker-row-count");
    const observedIds: string[] = [];
    let maximumRelativeError = 0;
    for (const value of rows) {
      invariant(record(value), "worker-row-invalid");
      invariant(
        value.status === "passed",
        `worker-row-blocked:${String(value.formulaId)}:${String(value.reasonCode)}`,
      );
      invariant(typeof value.formulaId === "string", "worker-formula-id-invalid");
      observedIds.push(value.formulaId);
      const error = Number(value.observedMaximumRelativeError ?? 0);
      invariant(Number.isFinite(error) && error >= 0, "worker-relative-error-invalid");
      maximumRelativeError = Math.max(maximumRelativeError, error);
    }
    invariant(exactSet(observedIds, ids), "worker-id-order");

    return {
      schema: REPORT_SCHEMA,
      candidateGitSha: candidateSha,
      activationContentHash: activationAsset.contentHash,
      activationAssetSha256: sha256(readFileSync(ACTIVATION_PATH)),
      lane,
      laneAuthorityContentHash: definition.authorityContentHash,
      laneAuthorityAssetSha256: sha256(readFileSync(definition.authorityPath)),
      reusedMutableAssetSha256: sha256(readFileSync(MUTABLE_PATH)),
      reusedRendererV1AssetSha256: sha256(readFileSync(RENDERER_V1_PATH)),
      reusedTupleSetSha256: reusedTupleSetSha256(coverage),
      reusedFormulaIds: coverage.reusedIds,
      start,
      count: ids.length,
      fullLaneCount: definition.ids.length,
      gateSourceSha256: sha256(readFileSync(GATE_PATH)),
      sourceWorkerSha256: sha256(source),
      transformedWorkerSha256: sha256(transformed),
      renderer: output.renderer,
      maximumRelativeError,
      formulaIds: ids,
      rows: rows as RecordValue[],
    };
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function writeReport(report: ReleaseReport, path: string): void {
  const destination = resolve(path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function reportFiles(root: string): readonly string[] {
  const output: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...reportFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".json")) output.push(path);
  }
  return output.sort();
}

function verifyReportSet(path: string, coverage: Coverage): void {
  const expectedCandidateSha = candidateGitSha();
  const reports = reportFiles(resolve(path)).map((file) => {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    invariant(record(value) && value.schema === REPORT_SCHEMA, "report-schema");
    return value as unknown as ReleaseReport;
  });
  invariant(reports.length > 0, "report-set-empty");

  const observed = new Map<Lane, string[]>();
  observed.set("main", []);
  observed.set("corrective", []);
  for (const report of reports) {
    invariant(
      (report.lane === "main" || report.lane === "corrective") &&
        Array.isArray(report.formulaIds) &&
        Array.isArray(report.rows),
      "report-shape",
    );
    invariant(
      report.candidateGitSha === expectedCandidateSha,
      "report-candidate-sha-binding",
    );
    invariant(
      report.activationContentHash === activationAsset.contentHash,
      "report-activation-binding",
    );
    invariant(
      report.activationAssetSha256 === sha256(readFileSync(ACTIVATION_PATH)),
      "report-activation-byte-binding",
    );
    invariant(
      report.gateSourceSha256 === sha256(readFileSync(GATE_PATH)),
      "report-gate-binding",
    );
    const definition = laneDefinition(report.lane, coverage);
    invariant(
      report.laneAuthorityContentHash === definition.authorityContentHash,
      "report-lane-binding",
    );
    invariant(
      report.laneAuthorityAssetSha256 ===
        sha256(readFileSync(definition.authorityPath)),
      "report-lane-byte-binding",
    );
    invariant(
      report.reusedMutableAssetSha256 === sha256(readFileSync(MUTABLE_PATH)) &&
        report.reusedRendererV1AssetSha256 ===
          sha256(readFileSync(RENDERER_V1_PATH)) &&
        report.reusedTupleSetSha256 === reusedTupleSetSha256(coverage) &&
        Array.isArray(report.reusedFormulaIds) &&
        exactSet(report.reusedFormulaIds, coverage.reusedIds),
      "report-reused-binding",
    );
    const currentSource = readFileSync(definition.workerPath, "utf8");
    invariant(report.sourceWorkerSha256 === sha256(currentSource), "report-source-binding");
    invariant(
      report.transformedWorkerSha256 === sha256(transformWorker(currentSource)),
      "report-transform-binding",
    );
    invariant(
      typeof report.renderer === "string" &&
        report.renderer.includes("SwiftShader") &&
        Number.isFinite(report.maximumRelativeError) &&
        report.maximumRelativeError >= 0,
      "report-renderer",
    );
    invariant(
      report.fullLaneCount === definition.ids.length &&
        report.count === report.formulaIds.length &&
        report.start >= 0 &&
        report.start + report.count <= definition.ids.length,
      "report-range",
    );
    invariant(
      exactSet(
        report.formulaIds,
        definition.ids.slice(report.start, report.start + report.count),
      ),
      "report-id-range",
    );
    invariant(report.rows.length === report.formulaIds.length, "report-row-count");
    const authorityRows =
      report.lane === "main" ? rendererV2Asset.rows : classicRendererAsset.rows;
    const authorityById = new Map(
      authorityRows.map((row) => [row.formulaId, row]),
    );
    let observedMaximumRelativeError = 0;
    report.rows.forEach((row, index) => {
      const formulaId = report.formulaIds[index];
      invariant(typeof formulaId === "string", "report-formula-id");
      observedMaximumRelativeError = Math.max(
        observedMaximumRelativeError,
        validateReportRow(
          row,
          formulaId,
          authorityById.get(formulaId) as unknown as RecordValue | undefined,
        ),
      );
    });
    invariant(
      report.maximumRelativeError === observedMaximumRelativeError,
      "report-maximum-relative-error",
    );
    observed.get(report.lane)?.push(...report.formulaIds);
  }

  for (const lane of ["main", "corrective"] as const) {
    const ids = sortedUnique(observed.get(lane) ?? [], `report-${lane}`);
    invariant(exactSet(ids, laneDefinition(lane, coverage).ids), `report-${lane}-coverage`);
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      candidateGitSha: expectedCandidateSha,
      activationCount: coverage.activationIds.length,
      currentWebgl1DeepCount: coverage.mainIds.length + coverage.correctiveIds.length,
      reusedEquivalentWebgl1Count: coverage.reusedIds.length,
      reportCount: reports.length,
    })}\n`,
  );
}

function main(): void {
  const coverage = buildCoverage();
  const reportRoot = stringFlag("verify-report-dir");
  if (reportRoot) {
    verifyReportSet(reportRoot, coverage);
    return;
  }
  const lane = parseLane();
  if (!lane) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        activationCount: coverage.activationIds.length,
        mainCount: coverage.mainIds.length,
        correctiveCount: coverage.correctiveIds.length,
        reusedEquivalentCount: coverage.reusedIds.length,
      })}\n`,
    );
    return;
  }
  const report = runLane(lane, coverage);
  const reportPath = stringFlag("report");
  if (reportPath) writeReport(report, reportPath);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      lane: report.lane,
      start: report.start,
      count: report.count,
      renderer: report.renderer,
      maximumRelativeError: report.maximumRelativeError,
      report: reportPath ?? null,
    })}\n`,
  );
}

const entryPoint = process.argv[1];
if (
  entryPoint &&
  import.meta.url === pathToFileURL(resolve(entryPoint)).href
) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
