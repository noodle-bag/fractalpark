import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import rendererAsset from "../resources/formula-library/v1/julia-renderer-evidence.v1.json";
import runtimeAsset from "../public/formula-library/v1/runtime/published/index.json";
import { matchesSealedJuliaReleaseSourceBindings } from "./lib/julia-pre-gpu-release-source-bindings";
import { parseJuliaPreGpuCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-pre-gpu-capability";
import {
  buildJuliaRendererProfileV1,
  JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1,
  JULIA_RENDERER_SOURCE_BINDING_PATHS_V1,
  parseJuliaRendererEvidenceV1,
  type JuliaRendererEvidenceRowV1,
  type JuliaRendererReportRowV1,
} from "../src/engine/formulas/v1/julia-renderer-evidence";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";

const ROOT = process.cwd();
const STABLE_REASON_PREFIXES = Object.freeze([
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

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function filesUnder(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    filesUnder(join(path, entry.name)),
  );
}

function stableReasonCode(reasonCode: string | null): string {
  if (!reasonCode) return "renderer-tier2-failed";
  return (
    STABLE_REASON_PREFIXES.find(
      (prefix) => reasonCode === prefix || reasonCode.startsWith(`${prefix}:`),
    ) ?? "renderer-tier2-failed"
  );
}

function reportRows(inputs: readonly string[]): JuliaRendererEvidenceRowV1[] {
  const files = inputs.flatMap(filesUnder).filter((path) => path.endsWith(".json"));
  invariant(files.length > 0, "julia-renderer-release-report-missing");
  const rows: JuliaRendererEvidenceRowV1[] = [];
  for (const file of files) {
    const report = JSON.parse(readFileSync(file, "utf8")) as unknown;
    invariant(
      record(report) &&
        report.schema === "fractalpark-julia-renderer-report/v1" &&
        report.ok === true &&
        report.fullAuthorityRowCount === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 &&
        typeof report.renderer === "string" &&
        report.renderer.includes("SwiftShader") &&
        report.preGpuContentHash === preGpuAsset.contentHash &&
        report.preGpuRowMapContentHash === preGpuAsset.rowMapContentHash &&
        Array.isArray(report.rows) &&
        report.rows.length === report.rowCount &&
        report.idsSha256 ===
          sha256HexSyncV1(
            (report.rows as JuliaRendererReportRowV1[])
              .map((row) => row.formulaId)
              .join("\n"),
          ),
      `julia-renderer-release-report-invalid:${file}`,
    );
    for (const row of report.rows as JuliaRendererReportRowV1[]) {
      invariant(
        Number.isSafeInteger(row.observedImageDifferingPixels) &&
          row.observedImageDifferingPixels >= 0 &&
          Number.isFinite(row.observedMaximumRelativeError) &&
          row.observedMaximumRelativeError >= 0 &&
          (row.status !== "passed" ||
            (row.observedImageDifferingPixels >= 1 &&
              row.observedMaximumRelativeError <= 0.005)),
        `julia-renderer-release-observation-invalid:${row.formulaId}`,
      );
      const {
        observedImageDifferingPixels: _differingPixels,
        observedMaximumRelativeError: _relativeError,
        ...stable
      } = row;
      void _differingPixels;
      void _relativeError;
      rows.push({
        ...stable,
        reasonCode:
          stable.status === "passed" ? null : stableReasonCode(row.reasonCode),
        minimumImageDifferingPixels: 1,
        relativeTolerance: 0.005,
      });
    }
  }
  rows.sort((left, right) => left.formulaId.localeCompare(right.formulaId));
  invariant(
    rows.length === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 &&
      new Set(rows.map((row) => row.formulaId)).size === rows.length,
    "julia-renderer-release-coverage-invalid",
  );
  return rows;
}

const sealed = parseJuliaRendererEvidenceV1(rendererAsset);
const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
const runtime = parsePublishedFormulaRuntimeIndexV1(runtimeAsset);
invariant(sealed.ok, "julia-renderer-release-sealed-invalid");
invariant(preGpu.ok, "julia-renderer-release-pre-gpu-invalid");
invariant(runtime.ok, "julia-renderer-release-runtime-invalid");

const currentBindings = Object.freeze(
  Object.fromEntries(
    JULIA_RENDERER_SOURCE_BINDING_PATHS_V1.map((relativePath) => [
      relativePath,
      sha256HexSyncV1(readFileSync(join(ROOT, relativePath), "utf8")),
    ]),
  ),
);
invariant(
  matchesSealedJuliaReleaseSourceBindings(
    sealed.value.sourceBindings,
    currentBindings,
    readFileSync(join(ROOT, "package.json"), "utf8"),
    readFileSync(join(ROOT, "package-lock.json"), "utf8"),
  ),
  "julia-renderer-release-source-binding-invalid",
);

const rows = reportRows(process.argv.slice(2));
invariant(
  JSON.stringify(rows) === JSON.stringify(sealed.value.rows),
  "julia-renderer-release-row-drift",
);
const runtimeById = new Map(runtime.value.rows.map((row) => [row.formulaId, row]));
const preGpuById = new Map(preGpu.value.rows.map((row) => [row.formulaId, row]));
for (const row of rows) {
  const runtimeRow = runtimeById.get(row.formulaId);
  const preGpuRow = preGpuById.get(row.formulaId);
  invariant(runtimeRow && preGpuRow, `julia-renderer-release-row-unknown:${row.formulaId}`);
  invariant(
    buildJuliaRendererProfileV1(runtimeRow, preGpuRow).profileDigest ===
      row.profileDigest,
    `julia-renderer-release-profile-drift:${row.formulaId}`,
  );
}

console.log(
  `PASS: ${rows.length} Julia renderer rows exact; reviewed 0.4.20 metadata transition only`,
);
