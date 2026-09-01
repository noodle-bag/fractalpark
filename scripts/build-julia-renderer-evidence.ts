import {
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import {
  buildJuliaRendererProfileV1,
  JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1,
  JULIA_RENDERER_EVIDENCE_SCHEMA_V1,
  JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1,
  JULIA_RENDERER_SOURCE_BINDING_PATHS_V1,
  parseJuliaRendererEvidenceV1,
  type JuliaRendererEvidenceRowV1,
  type JuliaRendererReportRowV1,
} from "../src/engine/formulas/v1/julia-renderer-evidence";
import { parseJuliaPreGpuCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import {
  canonicalJsonV1,
  sha256HexSyncV1,
} from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const OUTPUT_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const CANONICAL_NODE_BUDGET = 131_072;

type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const STABLE_RENDERER_REASON_PREFIXES = Object.freeze([
  "trace-state-mismatch",
  "trace-flag-mismatch",
  "trace-nondeterministic",
  "image-state-mismatch",
  "image-flag-mismatch",
  "image-nondeterministic",
  "image-constant-insensitive",
  "full-framework-draw-nondeterministic",
  "full-framework-draw-non-finite",
  "full-framework-position-attribute-missing",
  "full-framework-uniform-missing",
  "shader-compile-failed",
  "program-link-failed",
  "renderer-uniform-missing",
  "draw-failed",
] as const);

function stableReasonCode(reasonCode: string | null): string {
  if (!reasonCode) return "renderer-tier2-failed";
  return (
    STABLE_RENDERER_REASON_PREFIXES.find(
      (prefix) => reasonCode === prefix || reasonCode.startsWith(`${prefix}:`),
    ) ?? "renderer-tier2-failed"
  );
}

function filesUnder(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    filesUnder(join(path, entry.name)),
  );
}

function sourceBindings(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      JULIA_RENDERER_SOURCE_BINDING_PATHS_V1.map((relativePath) => [
        relativePath,
        sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
      ]),
    ),
  );
}

function readRows(
  inputs: readonly string[],
  expectedPreGpuContentHash: string,
  expectedPreGpuRowMapContentHash: string,
): JuliaRendererEvidenceRowV1[] {
  invariant(inputs.length > 0, "julia-renderer-reports-input-missing");
  const reportFiles = inputs
    .flatMap(filesUnder)
    .filter((path) => path.endsWith(".json"))
    .sort();
  invariant(reportFiles.length > 0, "julia-renderer-reports-missing");
  const rows: JuliaRendererEvidenceRowV1[] = [];
  for (const reportFile of reportFiles) {
    const report = JSON.parse(readFileSync(reportFile, "utf8")) as unknown;
    invariant(
      record(report) &&
        report.schema === "fractalpark-julia-renderer-report/v1" &&
        report.ok === true &&
        report.fullAuthorityRowCount === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 &&
        typeof report.renderer === "string" &&
        report.renderer.includes("SwiftShader") &&
        report.preGpuContentHash === expectedPreGpuContentHash &&
        report.preGpuRowMapContentHash === expectedPreGpuRowMapContentHash &&
        Array.isArray(report.rows) &&
        report.rows.length === report.rowCount &&
        typeof report.idsSha256 === "string" &&
        report.idsSha256 ===
          sha256HexSyncV1(
            (report.rows as JuliaRendererReportRowV1[])
              .map((row) => row.formulaId)
              .join("\n"),
          ) &&
        record(report.statusCounts) &&
        report.statusCounts.passed ===
          (report.rows as JuliaRendererReportRowV1[]).filter(
            (row) => row.status === "passed",
          ).length &&
        report.statusCounts.blocked ===
          (report.rows as JuliaRendererReportRowV1[]).filter(
            (row) => row.status === "blocked",
          ).length,
      `julia-renderer-report-invalid:${reportFile}`,
    );
    for (const reportRow of report.rows as JuliaRendererReportRowV1[]) {
      invariant(
        Number.isSafeInteger(reportRow.observedImageDifferingPixels) &&
          reportRow.observedImageDifferingPixels >= 0 &&
          Number.isFinite(reportRow.observedMaximumRelativeError) &&
          reportRow.observedMaximumRelativeError >= 0 &&
          (reportRow.status !== "passed" ||
            (reportRow.observedImageDifferingPixels >= 1 &&
              reportRow.observedMaximumRelativeError <= 0.005)),
        `julia-renderer-report-observation-invalid:${reportRow.formulaId}`,
      );
      const {
        observedImageDifferingPixels: _observedImageDifferingPixels,
        observedMaximumRelativeError: _observedMaximumRelativeError,
        ...stableRow
      } = reportRow;
      void _observedImageDifferingPixels;
      void _observedMaximumRelativeError;
      rows.push({
        ...stableRow,
        reasonCode:
          stableRow.status === "passed"
            ? null
            : stableReasonCode(reportRow.reasonCode),
        minimumImageDifferingPixels: 1,
        relativeTolerance: 0.005,
      });
    }
  }
  rows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  invariant(
    rows.length === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 &&
      new Set(rows.map((row) => row.formulaId)).size === rows.length,
    "julia-renderer-report-coverage-invalid",
  );
  return rows;
}

function buildArtifact(inputs: readonly string[]) {
  const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
  invariant(preGpu.ok, "julia-renderer-pre-gpu-invalid");
  const rows = readRows(
    inputs,
    preGpu.value.contentHash,
    preGpu.value.rowMapContentHash,
  );
  const runtime = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  invariant(runtime.ok, "julia-renderer-runtime-index-invalid");
  const expectedPreGpu = preGpu.value.rows
    .filter((row) => row.disposition === "tier2-pending")
    .sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  const runtimeById = new Map(
    runtime.value.rows.map((row) => [row.formulaId, row]),
  );
  invariant(
    expectedPreGpu.length === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1,
    "julia-renderer-pre-gpu-authority-invalid",
  );
  for (const [index, row] of rows.entries()) {
    const preGpuRow = expectedPreGpu[index];
    const runtimeRow = runtimeById.get(row.formulaId);
    invariant(
      preGpuRow?.formulaId === row.formulaId &&
        runtimeRow &&
        row.evaluatedSourceRevision === preGpuRow.evaluatedSourceRevision &&
        row.evaluatedSemanticHash === preGpuRow.evaluatedSemanticHash &&
        row.bindingRevision === preGpuRow.bindingRevision &&
        row.lane === preGpuRow.lane &&
        row.modeClass === preGpuRow.modeClass,
      `julia-renderer-row-authority-drift:${row.formulaId}`,
    );
    const profile = buildJuliaRendererProfileV1(runtimeRow, preGpuRow);
    invariant(
      row.profileDigest === profile.profileDigest,
      `julia-renderer-profile-drift:${row.formulaId}`,
    );
    invariant(
      row.fullFrameworkCappedDraw ===
        (
          JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1 as readonly string[]
        ).includes(row.formulaId),
      `julia-renderer-integration-witness-drift:${row.formulaId}`,
    );
  }
  const passed = rows.filter((row) => row.status === "passed").length;
  const blocked = rows.length - passed;
  const content = {
    schema: JULIA_RENDERER_EVIDENCE_SCHEMA_V1,
    revision: 1 as const,
    stage: "tier2-renderer-closure" as const,
    activationStatus: "inactive-evidence-only" as const,
    rendererPolicy: "Chromium-WebGL1-SwiftShader-software" as const,
    tier3Scope: {
      schema: "fractalpark-julia-tier3-scope/v1" as const,
      status: "pending-physical-device-evidence" as const,
      stratification: [
        "family",
        "backend-risk",
        "lane",
        "numeric-risk",
      ] as const,
      physicalDeviceSampleCount: 0 as const,
      crossDeviceGuarantee: false as const,
    },
    preGpuContentHash: preGpu.value.contentHash,
    preGpuRowMapContentHash: preGpu.value.rowMapContentHash,
    integrationWitnessFormulaIds:
      JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1,
    integrationWitnessCount: 1 as const,
    sourceBindings: sourceBindings(),
    rowCount: JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1,
    statusCounts: { passed, blocked },
    rows,
  };
  const artifact = {
    ...content,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
    ),
  };
  invariant(
    parseJuliaRendererEvidenceV1(artifact).ok,
    "julia-renderer-artifact-invalid",
  );
  return artifact;
}

function main(): void {
  const inputs = process.argv
    .slice(2)
    .filter((argument) => argument !== "--write");
  const artifact = buildArtifact(inputs);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const temporaryPath = `${OUTPUT_PATH}.tmp`;
    writeFileSync(temporaryPath, serialized, { encoding: "utf8", mode: 0o644 });
    renameSync(temporaryPath, OUTPUT_PATH);
    process.stdout.write(
      `wrote ${OUTPUT_PATH} (${artifact.rowCount} rows, ${artifact.statusCounts.passed} passed, ${artifact.statusCounts.blocked} blocked)\n`,
    );
    return;
  }
  invariant(
    readFileSync(OUTPUT_PATH, "utf8") === serialized,
    "julia-renderer-evidence-drift",
  );
  process.stdout.write(
    `verified ${OUTPUT_PATH} (${artifact.rowCount} rows, ${artifact.statusCounts.passed} passed, ${artifact.statusCounts.blocked} blocked)\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown-error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
