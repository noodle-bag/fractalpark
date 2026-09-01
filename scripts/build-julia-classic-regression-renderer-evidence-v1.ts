import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import correctiveAsset from "../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import {
  parseJuliaClassicRegressionCorrectiveV1,
} from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import {
  JULIA_CLASSIC_REGRESSION_RENDERER_CONSTANTS_V2,
  JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_HEIGHT_V2,
  JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_ITERATIONS_V2,
  JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_WIDTH_V2,
  JULIA_CLASSIC_REGRESSION_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
  JULIA_CLASSIC_REGRESSION_RENDERER_MAX_DEPTH_V2,
  JULIA_CLASSIC_REGRESSION_RENDERER_POINTS_V2,
} from "../src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1";
import {
  JULIA_CLASSIC_REGRESSION_RENDERER_CLOSURE_SCHEMA_V1,
  JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1,
  juliaClassicRegressionRendererEvidenceContentHashV1,
  juliaClassicRegressionRendererEvidenceRowReceiptV1,
  juliaClassicRegressionRendererReportContentHashV1,
  parseJuliaClassicRegressionRendererEvidenceV1,
  parseJuliaClassicRegressionRendererReportV1,
  type JuliaClassicRegressionRendererEvidenceRowV1,
  type JuliaClassicRegressionRendererEvidenceV1,
} from "../src/engine/formulas/v1/julia-classic-regression-renderer-closure-v1";

const ROOT = process.cwd();
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json",
);

const STATIC_SOURCE_BINDING_PATHS = Object.freeze([
  "public/formula-library/v1/runtime/published/index.json",
  "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
  "scripts/build-julia-classic-regression-corrective-v1.ts",
  "scripts/build-julia-classic-regression-renderer-evidence-v1.ts",
  "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
  "scripts/verify-julia-classic-regression-corrective-v1.ts",
  "scripts/verify-julia-classic-regression-renderer-evidence-v1.ts",
  "scripts/verify-julia-classic-regression-tier2-report-v1.ts",
  "scripts/verify-julia-classic-regression-tier2-webgl-v1.ts",
  "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
  "src/engine/formulas/v1/julia-classic-regression-renderer-closure-v1.ts",
  "src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1.ts",
  "src/test/julia-classic-regression-corrective-v1.test.ts",
  "src/test/julia-classic-regression-renderer-evidence-v1.test.ts",
]);

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function requireRegularFile(path: string, mode: number, code: string): void {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== mode
  )
    throw new Error(code);
}

function main(): void {
  const reportArgument = process.argv.find((argument) =>
    argument.startsWith("--report="),
  );
  if (!reportArgument)
    throw new Error(
      "build-julia-classic-regression-renderer-evidence-v1-report-missing",
    );
  const reportPath = resolve(reportArgument.slice("--report=".length));
  requireRegularFile(
    reportPath,
    0o600,
    "build-julia-classic-regression-renderer-evidence-v1-report-invalid",
  );

  execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      join(
        ROOT,
        "scripts/verify-julia-classic-regression-tier2-report-v1.ts",
      ),
      `--report=${reportPath}`,
    ],
    { cwd: ROOT, stdio: "pipe" },
  );

  const parsedReport = parseJuliaClassicRegressionRendererReportV1(
    JSON.parse(readFileSync(reportPath, "utf8")),
  );
  if (!parsedReport.ok) throw new Error(parsedReport.code);
  const report = parsedReport.value;

  const corrective = parseJuliaClassicRegressionCorrectiveV1(correctiveAsset);
  if (!corrective.ok)
    throw new Error(
      "build-julia-classic-regression-renderer-evidence-v1-corrective-invalid",
    );
  const authority = corrective.value;

  const sourcePaths = [
    ...new Set([
      ...STATIC_SOURCE_BINDING_PATHS,
      ...authority.rows.map(
        (row) => `resources/formula-library/v1/${row.candidatePath}`,
      ),
      ...Object.keys(authority.sourceBindings),
    ]),
  ].sort();
  const sourceBindings = Object.freeze(
    Object.fromEntries(
      sourcePaths.map((path) => [path, sha256File(join(ROOT, path))]),
    ),
  );

  const rows = Object.freeze(
    report.rows.map((reportRow) => {
      const receiptBody = {
        ...reportRow,
        minimumImageDifferingPixels: 1 as const,
        relativeTolerance:
          JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1 as 0.005,
      };
      return Object.freeze({
        ...receiptBody,
        receipt:
          juliaClassicRegressionRendererEvidenceRowReceiptV1(receiptBody),
      }) as JuliaClassicRegressionRendererEvidenceRowV1;
    }),
  );

  const body = {
    schema: JULIA_CLASSIC_REGRESSION_RENDERER_CLOSURE_SCHEMA_V1,
    revision: 1 as const,
    authority: "evidence-only" as const,
    activationStatus: false as const,
    correctiveContentHash: authority.contentHash,
    correctiveWholeFileSha256: sha256File(
      join(
        ROOT,
        "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
      ),
    ),
    privateReportWholeSha256: sha256File(reportPath),
    privateReportContentHash:
      juliaClassicRegressionRendererReportContentHashV1(report),
    executionSourceBindingsContentHash:
      report.executionSourceBindingsContentHash,
    workerBundleSha256: report.workerBundleSha256,
    runtimeDependencyBindings: report.runtimeDependencyBindings,
    renderer: report.renderer,
    durationMs: report.durationMs,
    idsSha256: report.idsSha256,
    profileContract: Object.freeze({
      maximumDepth: JULIA_CLASSIC_REGRESSION_RENDERER_MAX_DEPTH_V2,
      imageIterations:
        JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_ITERATIONS_V2,
      points: JULIA_CLASSIC_REGRESSION_RENDERER_POINTS_V2,
      constants: JULIA_CLASSIC_REGRESSION_RENDERER_CONSTANTS_V2,
      integrationWitnessFormulaId:
        JULIA_CLASSIC_REGRESSION_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
    }),
    traceContract: Object.freeze({
      orbitSteps: 128 as const,
      stateDimensions: 18 as const,
      stateComparisons: 2304 as const,
      flagComparisons: 2304 as const,
    }),
    imageContract: Object.freeze({
      width: JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_WIDTH_V2,
      height: JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_HEIGHT_V2,
      iterations: JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_ITERATIONS_V2,
      pixelComparisons: 96 as const,
      minimumImageDifferingPixels: 1 as const,
      relativeTolerance:
        JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1 as 0.005,
    }),
    statusCounts: report.statusCounts,
    rowCount: 7 as const,
    rows,
    sourceBindings,
  } satisfies Omit<JuliaClassicRegressionRendererEvidenceV1, "contentHash">;

  const asset = {
    ...body,
    contentHash: juliaClassicRegressionRendererEvidenceContentHashV1(body),
  } satisfies JuliaClassicRegressionRendererEvidenceV1;
  const parsedAsset = parseJuliaClassicRegressionRendererEvidenceV1(asset);
  if (!parsedAsset.ok) throw new Error(parsedAsset.code);

  const bytes = Buffer.from(`${JSON.stringify(asset, null, 2)}\n`, "utf8");
  const temporaryPath = `${OUTPUT_PATH}.tmp-${process.pid}`;
  try {
    if (existsSync(OUTPUT_PATH))
      requireRegularFile(
        OUTPUT_PATH,
        0o644,
        "build-julia-classic-regression-renderer-evidence-v1-output-invalid",
      );
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    chmodSync(temporaryPath, 0o644);
    renameSync(temporaryPath, OUTPUT_PATH);
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      rowCount: rows.length,
      passed: report.statusCounts.passed,
      blocked: report.statusCounts.blocked,
      contentHash: asset.contentHash,
      wholeFileSha256: sha256Bytes(bytes),
    })}\n`,
  );
}

main();
