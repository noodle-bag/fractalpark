import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import manifestAsset from "../resources/formula-library/v1/julia-pixel-candidate-manifest.v1.json";
import candidateAsset from "../resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json";
import preGpuAsset from "../resources/formula-library/v1/julia-pre-gpu-recovery-census.v2.json";
import runtimeAsset from "../public/formula-library/v1/runtime/published/index.json";
import { parseJuliaPixelRecoveryCandidatesV1 } from "../src/engine/formulas/v1/julia-pixel-recovery-candidates";
import {
  parseJuliaPixelCandidateManifestV1,
  parseJuliaPreGpuRecoveryCensusV2,
} from "../src/engine/formulas/v1/julia-pre-gpu-recovery-v2";
import {
  type JuliaRendererReportRowV2,
} from "../src/engine/formulas/v1/julia-renderer-evidence-v2";
import {
  buildJuliaRendererDefinitionBindingPathsV2,
  buildJuliaRendererExecutionSourceBindingPathsV2,
  buildJuliaRendererSourceBindingContentHashV2,
} from "../src/engine/formulas/v1/julia-renderer-source-bindings-v2";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";
import { verifyPrivateEvidenceRoot } from "./lib/julia-private-evidence-root";
import {
  auditJuliaRuntimeDependenciesV2,
  auditJuliaWorkerBundleV2,
  pinJuliaRuntimeDependenciesV2,
} from "./lib/julia-worker-bundle-audit";

const ROOT = process.cwd();
const WORKER_SOURCE = join(ROOT, "scripts/run-julia-tier2-webgl-worker-v2.ts");
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/julia-tier2-webgl-worker-v2.mjs",
);
const PRIVATE_RELATIVE_ROOT =
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1";
const PRIVATE_ROOT = join(ROOT, PRIVATE_RELATIVE_ROOT);
const REPORT_ROOT = join(PRIVATE_ROOT, "renderer-v2-reports");

function numericArg(name: string, fallback: number): number {
  const raw = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`julia-tier2-v2-${name}-invalid`);
  return value;
}

function startArg(): number {
  const raw = process.argv.find((argument) => argument.startsWith("--start="));
  if (!raw) return 0;
  const value = Number(raw.slice("--start=".length));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("julia-tier2-v2-start-invalid");
  return value;
}

function stringArg(name: string): string | undefined {
  const raw = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  return raw?.slice(name.length + 3);
}

function reportArg(): string | undefined {
  const raw = stringArg("report");
  if (raw === undefined) return undefined;
  const privateRoot = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "julia-tier2-v2-private-root-invalid",
  );
  if (!existsSync(REPORT_ROOT)) mkdirSync(REPORT_ROOT, { mode: 0o700 });
  const rootStat = lstatSync(REPORT_ROOT);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootStat.uid !== process.getuid?.() ||
    (rootStat.mode & 0o777) !== 0o700
  )
    throw new Error("julia-tier2-v2-report-root-invalid");
  const reportRoot = realpathSync(REPORT_ROOT);
  if (!reportRoot.startsWith(`${privateRoot}${sep}`))
    throw new Error("julia-tier2-v2-report-root-escape");
  const path = resolve(raw);
  if (realpathSync(dirname(path)) !== reportRoot)
    throw new Error("julia-tier2-v2-report-path-invalid");
  return path;
}


function executionSourceBindingsContentHash(
  definitionPaths: readonly string[],
): string {
  return buildJuliaRendererSourceBindingContentHashV2(
    buildJuliaRendererExecutionSourceBindingPathsV2(definitionPaths),
    (path) => readFileSync(join(ROOT, path), "utf8"),
  );
}

function parseWorkerOutput(output: string): {
  readonly ok: true;
  readonly renderer: string;
  readonly rows: readonly JuliaRendererReportRowV2[];
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
    throw new Error("julia-tier2-v2-worker-output-invalid");
  return parsed as ReturnType<typeof parseWorkerOutput>;
}

function main(): void {
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  if (!preGpu.ok) throw new Error("julia-tier2-v2-pre-gpu-invalid");
  const manifest = parseJuliaPixelCandidateManifestV1(
    manifestAsset,
    preGpu.value,
  );
  if (!manifest.ok) throw new Error("julia-tier2-v2-manifest-invalid");
  const candidates = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
  const runtime = parsePublishedFormulaRuntimeIndexV1(runtimeAsset);
  if (!candidates.ok || !runtime.ok)
    throw new Error("julia-tier2-v2-definition-authority-invalid");
  const definitionPaths = buildJuliaRendererDefinitionBindingPathsV2(
    preGpu.value.rows,
    runtime.value.rows,
    candidates.value.rows,
  );
  const allIds = manifest.value.rows.map((row) => row.formulaId);
  if (
    allIds.length !== 236 ||
    new Set(allIds).size !== 236 ||
    preGpu.value.statusCounts.tier2Queue !== 236
  )
    throw new Error("julia-tier2-v2-authority-set-invalid");
  const manifestById = new Map(
    manifest.value.rows.map((row) => [row.formulaId, row]),
  );
  const start = startArg();
  const limit = numericArg("limit", Number.MAX_SAFE_INTEGER);
  const chunkSize = numericArg("chunk-size", 2);
  const reportPath = reportArg();
  const ids = allIds.slice(start, Math.min(allIds.length, start + limit));
  const expectedRows = Math.min(limit, Math.max(0, allIds.length - start));
  if (ids.length === 0 || ids.length !== expectedRows)
    throw new Error("julia-tier2-v2-range-invalid");
  const executionPaths =
    buildJuliaRendererExecutionSourceBindingPathsV2(definitionPaths);
  const initialSourceBindingsContentHash =
    executionSourceBindingsContentHash(definitionPaths);
  const workerAudit = auditJuliaWorkerBundleV2(
    ROOT,
    WORKER_SOURCE,
    WORKER_BUNDLE,
    executionPaths,
    !process.argv.includes("--skip-bundle"),
  );
  if (
    executionSourceBindingsContentHash(definitionPaths) !==
    initialSourceBindingsContentHash
  )
    throw new Error("julia-tier2-v2-source-drift-during-bundle-audit");
  const runDirectory = mkdtempSync(join(tmpdir(), "fractalpark-julia-tier2-v2-"));
  chmodSync(runDirectory, 0o700);
  const cleanupRunDirectory = (): void => {
    rmSync(runDirectory, { recursive: true, force: true });
  };
  process.once("exit", cleanupRunDirectory);
  const pinnedBrowserExecutable = pinJuliaRuntimeDependenciesV2(
    ROOT,
    workerAudit.browserExecutablePath,
    runDirectory,
    workerAudit.runtimeDependencyBindings,
  );
  const pinnedWorkerBundle = join(runDirectory, "worker.mjs");
  const frozenBundleBytes = readFileSync(WORKER_BUNDLE);
  if (
    createHash("sha256").update(frozenBundleBytes).digest("hex") !==
    workerAudit.bundleSha256
  )
    throw new Error("julia-tier2-v2-worker-bundle-toctou");
  writeFileSync(pinnedWorkerBundle, frozenBundleBytes, {
    flag: "wx",
    mode: 0o600,
  });
  const workerBundleSha256 = workerAudit.bundleSha256;

  const rows: JuliaRendererReportRowV2[] = [];
  let renderer = "";
  const started = Date.now();
  const chunkCount = Math.ceil(ids.length / chunkSize);
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    const workerPayloadPath = join(runDirectory, `payload-${offset}.json`);
    writeFileSync(workerPayloadPath, `${JSON.stringify({ ids: chunk })}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    try {
      const worker = spawnSync(
        process.execPath,
        [pinnedWorkerBundle, workerPayloadPath],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: pinnedBrowserExecutable,
          },
          timeout: 900_000,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
      if (worker.status !== 0)
        throw new Error(
          `julia-tier2-v2-worker-failed:status=${String(worker.status)}:signal=${String(worker.signal)}:error=${worker.error?.message ?? "none"}:${String(worker.stderr).slice(0, 800)}`,
        );
      const result = parseWorkerOutput(String(worker.stdout));
      if (
        result.rows.length !== chunk.length ||
        result.rows.some((row, index) => row.formulaId !== chunk[index])
      )
        throw new Error("julia-tier2-v2-worker-row-set-invalid");
      if (renderer !== "" && renderer !== result.renderer)
        throw new Error("julia-tier2-v2-renderer-drift");
      renderer = result.renderer;
      for (const row of result.rows) {
        const candidate = manifestById.get(row.formulaId);
        if (
          !candidate ||
          row.candidateContentHash !== candidate.candidateContentHash ||
          row.evaluatedSourceRevision !== candidate.sourceRevision ||
          row.evaluatedSemanticHash !== candidate.semanticHash
        )
          throw new Error(`julia-tier2-v2-row-binding-invalid:${row.formulaId}`);
      }
      rows.push(...result.rows);
      const chunkNumber = Math.floor(offset / chunkSize) + 1;
      process.stderr.write(
        `julia tier2 v2 chunk ${chunkNumber}/${chunkCount} complete (${rows.length}/${ids.length})\n`,
      );
    } finally {
      rmSync(workerPayloadPath, { force: true });
    }
  }
  if (new Set(rows.map((row) => row.formulaId)).size !== rows.length)
    throw new Error("julia-tier2-v2-worker-row-duplicate");
  const passed = rows.filter((row) => row.status === "passed").length;
  const blocked = rows.length - passed;
  if (
    executionSourceBindingsContentHash(definitionPaths) !==
    initialSourceBindingsContentHash
  )
    throw new Error("julia-tier2-v2-source-drift-during-run");
  if (
    canonicalJsonV1(auditJuliaRuntimeDependenciesV2(ROOT), 64) !==
    canonicalJsonV1(workerAudit.runtimeDependencyBindings, 64)
  )
    throw new Error("julia-tier2-v2-runtime-drift-during-run");
  const report = {
    schema: "fractalpark-julia-renderer-report/v2" as const,
    ok: true as const,
    start,
    rowCount: rows.length,
    fullAuthorityRowCount: allIds.length,
    fullGate: start === 0 && rows.length === allIds.length,
    chunkSize,
    renderer,
    durationMs: Date.now() - started,
    candidateManifestContentHash: manifest.value.contentHash,
    waveId: manifest.value.waveId,
    preGpuContentHash: preGpu.value.contentHash,
    executionSourceBindingsContentHash: initialSourceBindingsContentHash,
    workerBundleSha256,
    runtimeDependencyBindings: workerAudit.runtimeDependencyBindings,
    idsSha256: createHash("sha256").update(ids.join("\n")).digest("hex"),
    statusCounts: { passed, blocked },
    rows,
  };
  if (reportPath)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
  cleanupRunDirectory();
  process.removeListener("exit", cleanupRunDirectory);
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
      waveId: report.waveId,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "julia-tier2-v2-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
