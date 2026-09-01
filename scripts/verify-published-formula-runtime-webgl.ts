import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import type { PublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";

const ROOT = process.cwd();
const INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const WORKER_SOURCE = join(
  ROOT,
  "scripts/run-published-formula-webgl-worker.ts",
);
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/published-formula-webgl-worker.mjs",
);

function numericArg(name: string, fallback: number): number {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`published-webgl-${name}-invalid`);
  return value;
}

function startArg(): number {
  const raw = process.argv.find((argument) => argument.startsWith("--start="));
  if (!raw) return 0;
  const value = Number(raw.slice("--start=".length));
  if (!Number.isInteger(value) || value < 0)
    throw new Error("published-webgl-start-invalid");
  return value;
}

function stringArg(name: string): string | undefined {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`));
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
      `published-webgl-worker-bundle-failed:${String(result.stderr).slice(0, 500)}`,
    );
}

function parseWorkerOutput(output: string): {
  ok: boolean;
  results: readonly {
    formulaId: string;
    ok: boolean;
    code?: string;
    renderer: string;
  }[];
} {
  const lines = output.trim().split("\n");
  const parsed = JSON.parse(lines.at(-1) ?? "{}") as {
    ok?: unknown;
    results?: unknown;
  };
  if (parsed.ok !== true || !Array.isArray(parsed.results))
    throw new Error("published-webgl-worker-output-invalid");
  return parsed as ReturnType<typeof parseWorkerOutput>;
}

function main(): void {
  const chunkSize = numericArg("chunk-size", 3);
  const limit = numericArg("limit", Number.MAX_SAFE_INTEGER);
  const start = startArg();
  const reportPath = stringArg("report");
  const index = JSON.parse(
    readFileSync(INDEX_PATH, "utf8"),
  ) as PublishedFormulaRuntimeIndexV1;
  const ids = index.rows
    .map((row) => row.formulaId)
    .sort()
    .slice(start, Math.min(index.rows.length, start + limit));
  const expectedRows = Math.min(
    limit,
    Math.max(0, index.rowCount - start),
  );
  if (ids.length === 0 || ids.length !== expectedRows)
    throw new Error("published-webgl-range-invalid");
  if (!process.argv.includes("--skip-bundle")) bundleWorker();

  let passed = 0;
  let renderer = "";
  const started = Date.now();
  const chunkCount = Math.ceil(ids.length / chunkSize);
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const payloadPath = join(
      tmpdir(),
      `fractalpark-published-webgl-${process.pid}-${offset}.json`,
    );
    writeFileSync(payloadPath, `${JSON.stringify({ ids: chunk })}\n`, {
      mode: 0o600,
    });
    try {
      const worker = spawnSync(process.execPath, [WORKER_BUNDLE, payloadPath], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 600_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (worker.status !== 0)
        throw new Error(
          `published-webgl-worker-failed:status=${String(worker.status)}:signal=${String(worker.signal)}:error=${worker.error?.message ?? "none"}:${String(worker.stderr).slice(0, 800)}`,
        );
      const result = parseWorkerOutput(String(worker.stdout));
      for (const row of result.results) {
        if (!row.ok)
          throw new Error(
            `published-webgl-formula-failed:${row.formulaId}:${row.code ?? "unknown"}`,
          );
        renderer = renderer || row.renderer;
        passed += 1;
      }
      const chunkNumber = Math.floor(offset / chunkSize) + 1;
      process.stderr.write(
        `published webgl chunk ${chunkNumber}/${chunkCount} passed (${passed}/${ids.length})\n`,
      );
    } finally {
      rmSync(payloadPath, { force: true });
    }
  }
  const summary = {
    ok: true,
    start,
    rowCount: ids.length,
    fullRuntimeRowCount: index.rowCount,
    fullGate: start === 0 && ids.length === index.rowCount,
    chunkSize,
    renderer,
    durationMs: Date.now() - started,
    idsSha256: createHash("sha256").update(ids.join("\n")).digest("hex"),
    checks: {
      fullFrameworkCompileLink: passed,
      candidateOrbitCpuGpuProbePairs: passed * 2,
    },
  };
  if (reportPath)
    writeFileSync(
      reportPath,
      `${JSON.stringify({ ...summary, formulaIds: ids }, null, 2)}\n`,
      { mode: 0o600 },
    );
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "published-webgl-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
