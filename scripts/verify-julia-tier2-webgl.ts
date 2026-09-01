import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json";
import type { JuliaRendererReportRowV1 } from "../src/engine/formulas/v1/julia-renderer-evidence";
import { parseJuliaPreGpuCapabilityCensusV1 } from "../src/engine/formulas/v1/julia-pre-gpu-capability";

const ROOT = process.cwd();
const WORKER_SOURCE = join(ROOT, "scripts/run-julia-tier2-webgl-worker.ts");
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/julia-tier2-webgl-worker.mjs",
);

function numericArg(name: string, fallback: number): number {
  const raw = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`julia-tier2-${name}-invalid`);
  return value;
}

function startArg(): number {
  const raw = process.argv.find((argument) => argument.startsWith("--start="));
  if (!raw) return 0;
  const value = Number(raw.slice("--start=".length));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("julia-tier2-start-invalid");
  return value;
}

function stringArg(name: string): string | undefined {
  const raw = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  return raw?.slice(name.length + 3);
}

function bundleWorker(): void {
  const esbuild = join(ROOT, "node_modules/.bin/esbuild");
  const result = spawnSync(
    esbuild,
    [
      WORKER_SOURCE,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--loader:.glsl=text",
      "--packages=external",
      `--outfile=${WORKER_BUNDLE}`,
    ],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
  if (result.status !== 0)
    throw new Error(
      `julia-tier2-worker-bundle-failed:${String(result.stderr).slice(0, 500)}`,
    );
}

function parseWorkerOutput(output: string): {
  readonly ok: true;
  readonly renderer: string;
  readonly rows: readonly JuliaRendererReportRowV1[];
} {
  const parsed = JSON.parse(output.trim().split("\n").at(-1) ?? "{}") as {
    ok?: unknown;
    renderer?: unknown;
    rows?: unknown;
  };
  if (
    parsed.ok !== true ||
    typeof parsed.renderer !== "string" ||
    !parsed.renderer.includes("SwiftShader") ||
    !Array.isArray(parsed.rows)
  )
    throw new Error("julia-tier2-worker-output-invalid");
  return parsed as ReturnType<typeof parseWorkerOutput>;
}

function main(): void {
  const preGpu = parseJuliaPreGpuCapabilityCensusV1(preGpuAsset);
  if (!preGpu.ok) throw new Error("julia-tier2-pre-gpu-invalid");
  const allIds = preGpu.value.rows
    .filter((row) => row.disposition === "tier2-pending")
    .map((row) => row.formulaId)
    .sort();
  if (allIds.length !== 185 || new Set(allIds).size !== 185)
    throw new Error("julia-tier2-authority-set-invalid");
  const start = startArg();
  const limit = numericArg("limit", Number.MAX_SAFE_INTEGER);
  const chunkSize = numericArg("chunk-size", 2);
  const reportPath = stringArg("report");
  const ids = allIds.slice(start, Math.min(allIds.length, start + limit));
  const expectedRows = Math.min(limit, Math.max(0, allIds.length - start));
  if (ids.length === 0 || ids.length !== expectedRows)
    throw new Error("julia-tier2-range-invalid");
  if (!process.argv.includes("--skip-bundle")) bundleWorker();

  const rows: JuliaRendererReportRowV1[] = [];
  let renderer = "";
  const started = Date.now();
  const chunkCount = Math.ceil(ids.length / chunkSize);
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const workerPayloadPath = join(
      tmpdir(),
      `fractalpark-julia-tier2-${process.pid}-${offset}.json`,
    );
    writeFileSync(workerPayloadPath, `${JSON.stringify({ ids: chunk })}\n`, {
      mode: 0o600,
    });
    try {
      const worker = spawnSync(
        process.execPath,
        [WORKER_BUNDLE, workerPayloadPath],
        {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 900_000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
      if (worker.status !== 0)
        throw new Error(
          `julia-tier2-worker-failed:status=${String(worker.status)}:signal=${String(worker.signal)}:error=${worker.error?.message ?? "none"}:${String(worker.stderr).slice(0, 800)}`,
        );
      const result = parseWorkerOutput(String(worker.stdout));
      if (
        result.rows.length !== chunk.length ||
        result.rows.some((row, index) => row.formulaId !== chunk[index])
      )
        throw new Error("julia-tier2-worker-row-set-invalid");
      renderer = renderer || result.renderer;
      rows.push(...result.rows);
      const chunkNumber = Math.floor(offset / chunkSize) + 1;
      process.stderr.write(
        `julia tier2 chunk ${chunkNumber}/${chunkCount} complete (${rows.length}/${ids.length})\n`,
      );
    } finally {
      rmSync(workerPayloadPath, { force: true });
    }
  }
  const passed = rows.filter((row) => row.status === "passed").length;
  const blocked = rows.length - passed;
  const report = {
    schema: "fractalpark-julia-renderer-report/v1" as const,
    ok: true as const,
    start,
    rowCount: rows.length,
    fullAuthorityRowCount: allIds.length,
    fullGate: start === 0 && rows.length === allIds.length,
    chunkSize,
    renderer,
    durationMs: Date.now() - started,
    preGpuContentHash: preGpu.value.contentHash,
    preGpuRowMapContentHash: preGpu.value.rowMapContentHash,
    idsSha256: createHash("sha256").update(ids.join("\n")).digest("hex"),
    statusCounts: { passed, blocked },
    rows,
  };
  if (reportPath)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      start,
      rowCount: rows.length,
      fullGate: report.fullGate,
      renderer,
      passed,
      blocked,
      durationMs: report.durationMs,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "julia-tier2-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
