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

import {
  JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1,
  parseJuliaClassicRegressionCorrectiveV1,
} from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import correctiveAsset from "../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import {
  type JuliaClassicRegressionRendererReportRowV1,
} from "../src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";
import { JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2 } from "../src/engine/formulas/v1/julia-renderer-source-bindings-v2";
import { verifyPrivateEvidenceRoot } from "./lib/julia-private-evidence-root";
import {
  auditJuliaRuntimeDependenciesV2,
  auditJuliaWorkerBundleV2,
  pinJuliaRuntimeDependenciesV2,
} from "./lib/julia-worker-bundle-audit";

const ROOT = process.cwd();
const WORKER_SOURCE = join(ROOT, "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts");
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/julia-classic-regression-tier2-webgl-worker-v1.mjs",
);
const PRIVATE_RELATIVE_ROOT = ".formula-library-private/julia-classic-regression-corrective-v1";
const PRIVATE_ROOT = join(ROOT, PRIVATE_RELATIVE_ROOT);
const REPORT_ROOT = join(PRIVATE_ROOT, "renderer-v1-reports");

function numericArg(name: string, fallback: number): number {
  const raw = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (!raw) return fallback;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`julia-classic-regression-tier2-v1-${name}-invalid`);
  return value;
}

function startArg(): number {
  const raw = process.argv.find((argument) => argument.startsWith("--start="));
  if (!raw) return 0;
  const value = Number(raw.slice("--start=".length));
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("julia-classic-regression-tier2-v1-start-invalid");
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
    "julia-classic-regression-tier2-v1-private-root-invalid",
  );
  if (!existsSync(REPORT_ROOT)) mkdirSync(REPORT_ROOT, { mode: 0o700 });
  const rootStat = lstatSync(REPORT_ROOT);
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootStat.uid !== process.getuid?.() ||
    (rootStat.mode & 0o777) !== 0o700
  )
    throw new Error("julia-classic-regression-tier2-v1-report-root-invalid");
  const reportRoot = realpathSync(REPORT_ROOT);
  if (!reportRoot.startsWith(`${privateRoot}${sep}`))
    throw new Error("julia-classic-regression-tier2-v1-report-root-escape");
  const path = resolve(raw);
  if (realpathSync(dirname(path)) !== reportRoot)
    throw new Error("julia-classic-regression-tier2-v1-report-path-invalid");
  return path;
}


function executionSourceBindingsContentHash(paths: readonly string[]): string {
  return createHash("sha256").update(canonicalJsonV1(
    Object.fromEntries(paths.map((path) => [path, createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex")])), 64_000,
  )).digest("hex");
}

function parseWorkerOutput(output: string): {
  readonly ok: true;
  readonly renderer: string;
  readonly rows: readonly JuliaClassicRegressionRendererReportRowV1[];
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
    throw new Error("julia-classic-regression-tier2-v1-worker-output-invalid");
  return parsed as ReturnType<typeof parseWorkerOutput>;
}

function main(): void {
  const corrective = parseJuliaClassicRegressionCorrectiveV1(correctiveAsset);
  if (!corrective.ok) throw new Error("julia-classic-regression-tier2-v1-corrective-invalid");
  const allIds = corrective.value.rows.map((row) => row.formulaId);
  if (allIds.length !== 7 || JSON.stringify(allIds) !== JSON.stringify(JULIA_CLASSIC_REGRESSION_CORRECTIVE_IDS_V1))
    throw new Error("julia-classic-regression-tier2-v1-authority-set-invalid");
  const manifestById = new Map(corrective.value.rows.map((row) => [row.formulaId, row]));
  const start = startArg();
  const limit = numericArg("limit", Number.MAX_SAFE_INTEGER);
  const chunkSize = numericArg("chunk-size", 7);
  const reportPath = reportArg();
  const ids = allIds.slice(start, Math.min(allIds.length, start + limit));
  const expectedRows = Math.min(limit, Math.max(0, allIds.length - start));
  if (ids.length === 0 || ids.length !== expectedRows)
    throw new Error("julia-classic-regression-tier2-v1-range-invalid");
  const executionPaths = [...new Set([
    ...JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2,
    "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
    "scripts/verify-julia-classic-regression-tier2-webgl-v1.ts",
    "src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1.ts",
    "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
    ...corrective.value.rows.map((row) => `resources/formula-library/v1/${row.candidatePath}`),
  ])].sort();
  const initialSourceBindingsContentHash =
    executionSourceBindingsContentHash(executionPaths);
  const workerAudit = auditJuliaWorkerBundleV2(
    ROOT,
    WORKER_SOURCE,
    WORKER_BUNDLE,
    [
      "resources/formula-library/v1/julia-capability-census.v1.json",
      "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
      "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
      "src/engine/formulas/v1/julia-capability.ts",
      "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
      "src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1.ts",
      "src/engine/formulas/v1/published-adapter.ts",
      "src/engine/formulas/v1/published-runtime.ts", "src/engine/formulas/v1/revisions.ts",
      "src/engine/frm/frm-v1-glsl-prelude.ts", "src/engine/frm/frm-v1-stdlib.ts",
      "src/engine/frm/v1-backend.ts", "src/engine/frm/v1.ts",
      "src/engine/plugins/builtins/coloring/inside-black.ts", "src/engine/plugins/builtins/coloring/smooth.ts",
      "src/engine/plugins/builtins/transforms/none.ts", "src/engine/plugins/registry.ts",
      "src/engine/shaders/assembler.ts", "src/engine/shaders/complex-math.glsl",
      "src/engine/shaders/framework.frag.glsl", "src/engine/shaders/palettes.glsl",
    ],
    !process.argv.includes("--skip-bundle"),
  );
  if (
    executionSourceBindingsContentHash(executionPaths) !==
    initialSourceBindingsContentHash
  )
    throw new Error("julia-classic-regression-tier2-v1-source-drift-during-bundle-audit");
  const runDirectory = mkdtempSync(join(tmpdir(), "fractalpark-julia-classic-regression-tier2-v1-"));
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
    throw new Error("julia-classic-regression-tier2-v1-worker-bundle-toctou");
  writeFileSync(pinnedWorkerBundle, frozenBundleBytes, {
    flag: "wx",
    mode: 0o600,
  });
  const workerBundleSha256 = workerAudit.bundleSha256;

  const rows: JuliaClassicRegressionRendererReportRowV1[] = [];
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
          `julia-classic-regression-tier2-v1-worker-failed:status=${String(worker.status)}:signal=${String(worker.signal)}:error=${worker.error?.message ?? "none"}:${String(worker.stderr).slice(0, 800)}`,
        );
      const result = parseWorkerOutput(String(worker.stdout));
      if (
        result.rows.length !== chunk.length ||
        result.rows.some((row, index) => row.formulaId !== chunk[index])
      )
        throw new Error("julia-classic-regression-tier2-v1-worker-row-set-invalid");
      if (renderer !== "" && renderer !== result.renderer)
        throw new Error("julia-classic-regression-tier2-v1-renderer-drift");
      renderer = result.renderer;
      for (const row of result.rows) {
        const candidate = manifestById.get(row.formulaId);
        if (
          !candidate ||
          row.candidateContentHash !== candidate.rowReceipt ||
          row.evaluatedSourceRevision !== candidate.candidateSourceRevision ||
          row.evaluatedSemanticHash !== candidate.candidateSemanticHash ||
          row.bindingRevision !== candidate.correctiveBindingRevision
        )
          throw new Error(`julia-classic-regression-tier2-v1-row-binding-invalid:${row.formulaId}`);
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
    throw new Error("julia-classic-regression-tier2-v1-worker-row-duplicate");
  const passed = rows.filter((row) => row.status === "passed").length;
  const blocked = rows.length - passed;
  if (
    executionSourceBindingsContentHash(executionPaths) !==
    initialSourceBindingsContentHash
  )
    throw new Error("julia-classic-regression-tier2-v1-source-drift-during-run");
  if (
    canonicalJsonV1(auditJuliaRuntimeDependenciesV2(ROOT), 64) !==
    canonicalJsonV1(workerAudit.runtimeDependencyBindings, 64)
  )
    throw new Error("julia-classic-regression-tier2-v1-runtime-drift-during-run");
  const report = {
    schema: "fractalpark-julia-classic-regression-renderer-report/v1" as const,
    ok: true as const,
    start,
    rowCount: rows.length,
    fullAuthorityRowCount: allIds.length,
    fullGate: start === 0 && rows.length === allIds.length,
    chunkSize,
    renderer,
    durationMs: Date.now() - started,
    candidateManifestContentHash: corrective.value.contentHash,
    waveId: corrective.value.contentHash,
    preGpuContentHash: corrective.value.contentHash,
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
      code: error instanceof Error ? error.message : "julia-classic-regression-tier2-v1-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
