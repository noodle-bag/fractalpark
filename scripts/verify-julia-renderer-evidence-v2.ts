import { lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2,
  parseJuliaRendererEvidenceV2,
  type JuliaRendererEvidenceRowV2,
  type JuliaRendererReportRowV2,
} from "../src/engine/formulas/v1/julia-renderer-evidence-v2";
import {
  buildJuliaRendererDefinitionBindingPathsV2,
  buildJuliaRendererExecutionSourceBindingPathsV2,
  buildJuliaRendererFullSourceBindingPathsV2,
  buildJuliaRendererSourceBindingContentHashV2,
  verifyJuliaRendererSourceBindingMapV2,
} from "../src/engine/formulas/v1/julia-renderer-source-bindings-v2";
import { parsePublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "../src/engine/formulas/v1/revisions";
import {
  verifyPrivateEvidenceFile,
  verifyPrivateEvidenceRoot,
} from "./lib/julia-private-evidence-root";
import { auditJuliaWorkerBundleV2 } from "./lib/julia-worker-bundle-audit";

const ROOT = process.cwd();
const PRIVATE_RELATIVE_ROOT =
  ".formula-library-private/formula-library-v1/julia-pixel-recovery-v1";
const PRIVATE_ROOT = join(ROOT, PRIVATE_RELATIVE_ROOT);
const EVIDENCE_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-renderer-evidence.v2.json",
);
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/julia-tier2-webgl-worker-v2.mjs",
);
const WORKER_SOURCE = join(ROOT, "scripts/run-julia-tier2-webgl-worker-v2.ts");
const SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_NODE_BUDGET = 1_048_576;
type JsonRecord = Record<string, unknown>;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function record(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function contentHash(value: JsonRecord): string {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  return sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET));
}

function readJson(path: string, privateMode: boolean): JsonRecord {
  const stat = lstatSync(path);
  invariant(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    "verify-julia-renderer-evidence-v2-input-file-invalid",
  );
  if (privateMode)
    invariant(
      (stat.mode & 0o777) === 0o600 && stat.uid === process.getuid?.(),
      "verify-julia-renderer-evidence-v2-input-mode-invalid",
    );
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), "verify-julia-renderer-evidence-v2-json-invalid");
  return value;
}

function privatePath(path: string): string {
  const root = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "verify-julia-renderer-evidence-v2-private-root-invalid",
  );
  return verifyPrivateEvidenceFile(
    root,
    path,
    "verify-julia-renderer-evidence-v2-private-path-escape",
  );
}

function reportPaths(): string[] {
  const paths = process.argv
    .filter((argument) => argument.startsWith("--report="))
    .map((argument) =>
      privatePath(resolve(argument.slice("--report=".length))),
    );
  invariant(paths.length > 0, "verify-julia-renderer-evidence-v2-report-missing");
  return paths;
}

interface Report {
  readonly schema: "fractalpark-julia-renderer-report/v2";
  readonly ok: true;
  readonly start: number;
  readonly rowCount: number;
  readonly fullAuthorityRowCount: number;
  readonly renderer: string;
  readonly candidateManifestContentHash: string;
  readonly waveId: string;
  readonly preGpuContentHash: string;
  readonly executionSourceBindingsContentHash: string;
  readonly workerBundleSha256: string;
  readonly runtimeDependencyBindings: Readonly<Record<string, string>>;
  readonly rows: readonly JuliaRendererReportRowV2[];
}

function parseReport(value: JsonRecord): Report {
  invariant(
    exactKeys(value, [
      "schema",
      "ok",
      "start",
      "rowCount",
      "fullAuthorityRowCount",
      "fullGate",
      "chunkSize",
      "renderer",
      "durationMs",
      "candidateManifestContentHash",
      "waveId",
      "preGpuContentHash",
      "executionSourceBindingsContentHash",
      "workerBundleSha256",
      "runtimeDependencyBindings",
      "idsSha256",
      "statusCounts",
      "rows",
    ]) &&
      value.schema === "fractalpark-julia-renderer-report/v2" &&
      value.ok === true &&
      Number.isSafeInteger(value.start) &&
      Number.isSafeInteger(value.rowCount) &&
      value.fullAuthorityRowCount === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 &&
      typeof value.renderer === "string" &&
      value.renderer.includes("SwiftShader") &&
      typeof value.candidateManifestContentHash === "string" &&
      SHA256.test(value.candidateManifestContentHash) &&
      value.waveId === value.candidateManifestContentHash &&
      typeof value.preGpuContentHash === "string" &&
      SHA256.test(value.preGpuContentHash) &&
      typeof value.executionSourceBindingsContentHash === "string" &&
      SHA256.test(value.executionSourceBindingsContentHash) &&
      typeof value.workerBundleSha256 === "string" &&
      SHA256.test(value.workerBundleSha256) &&
      record(value.runtimeDependencyBindings) &&
      exactKeys(value.runtimeDependencyBindings, [
        "@playwright/test",
        "playwright",
        "playwright-core",
        "chromium-runtime",
      ]) &&
      Object.values(value.runtimeDependencyBindings).every(
        (binding) => typeof binding === "string" && SHA256.test(binding),
      ) &&
      Array.isArray(value.rows) &&
      value.rows.length === value.rowCount,
    "verify-julia-renderer-evidence-v2-report-invalid",
  );
  return value as unknown as Report;
}

function stableReason(reason: string | null): string {
  if (reason === null) return "renderer-compatibility-failed";
  const stable = [
    "trace-nondeterministic",
    "trace-cardinality-mismatch",
    "trace-flag-mismatch",
    "trace-state-mismatch",
    "image-nondeterministic",
    "image-cardinality-mismatch",
    "image-flag-mismatch",
    "image-state-mismatch",
    "image-constant-insensitive",
    "full-framework-draw-nondeterministic",
    "full-framework-draw-non-finite",
    "draw-failed",
    "framebuffer-incomplete",
    "renderer-uniform-missing",
  ].find((code) => reason === code || reason.startsWith(`${code}:`));
  return stable ?? "renderer-compatibility-failed";
}

function projection(row: JuliaRendererReportRowV2): JuliaRendererEvidenceRowV2 {
  return {
    formulaId: row.formulaId,
    candidateContentHash: row.candidateContentHash,
    evaluatedSourceRevision: row.evaluatedSourceRevision,
    evaluatedSemanticHash: row.evaluatedSemanticHash,
    binding: row.binding,
    bindingRevision: row.bindingRevision,
    supportLane: row.supportLane,
    profileDigest: row.profileDigest,
    status: row.status,
    reasonCode: row.status === "passed" ? null : stableReason(row.reasonCode),
    rendererClass: row.rendererClass,
    fullFrameworkCompileLink: row.fullFrameworkCompileLink,
    fullFrameworkCappedDraw: row.fullFrameworkCappedDraw,
    deterministicDoubleDraw: row.deterministicDoubleDraw,
    traceOrbitSteps: row.traceOrbitSteps,
    traceStateDimensions: row.traceStateDimensions,
    traceStateComparisons: row.traceStateComparisons,
    traceFlagComparisons: row.traceFlagComparisons,
    imagePixelComparisons: row.imagePixelComparisons,
    minimumImageDifferingPixels: 1,
    relativeTolerance: 0.005,
  };
}

function main(): void {
  const parsedEvidence = parseJuliaRendererEvidenceV2(
    JSON.parse(readFileSync(EVIDENCE_PATH, "utf8")),
  );
  invariant(parsedEvidence.ok, "verify-julia-renderer-evidence-v2-artifact-invalid");
  const evidence = parsedEvidence.value;
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  invariant(preGpu.ok, "verify-julia-renderer-evidence-v2-pre-gpu-invalid");
  const manifest = parseJuliaPixelCandidateManifestV1(
    manifestAsset,
    preGpu.value,
  );
  invariant(manifest.ok, "verify-julia-renderer-evidence-v2-manifest-invalid");
  const candidates = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
  const runtime = parsePublishedFormulaRuntimeIndexV1(runtimeAsset);
  invariant(
    candidates.ok && runtime.ok,
    "verify-julia-renderer-evidence-v2-definition-authority-invalid",
  );
  const definitionPaths = buildJuliaRendererDefinitionBindingPathsV2(
    preGpu.value.rows,
    runtime.value.rows,
    candidates.value.rows,
  );
  invariant(
    evidence.waveId === manifest.value.waveId &&
      evidence.candidateManifestContentHash === manifest.value.contentHash &&
      evidence.preGpuContentHash === preGpu.value.contentHash,
    "verify-julia-renderer-evidence-v2-authority-binding-invalid",
  );
  const executionSourceBindingPaths =
    buildJuliaRendererExecutionSourceBindingPathsV2(definitionPaths);
  const currentExecutionSourceBindingsContentHash =
    buildJuliaRendererSourceBindingContentHashV2(
      executionSourceBindingPaths,
      (path) => readFileSync(join(ROOT, path), "utf8"),
    );
  const assertExecutionSourcesStable = (): void => {
    invariant(
      buildJuliaRendererSourceBindingContentHashV2(
        executionSourceBindingPaths,
        (path) => readFileSync(join(ROOT, path), "utf8"),
      ) === currentExecutionSourceBindingsContentHash,
      "verify-julia-renderer-evidence-v2-execution-source-drift",
    );
  };
  const workerAudit = auditJuliaWorkerBundleV2(
    ROOT,
    WORKER_SOURCE,
    WORKER_BUNDLE,
    executionSourceBindingPaths,
    false,
  );
  assertExecutionSourcesStable();
  const currentWorkerBundleSha256 = workerAudit.bundleSha256;
  invariant(
    canonicalJsonV1(evidence.runtimeDependencyBindings, 64) ===
      canonicalJsonV1(workerAudit.runtimeDependencyBindings, 64),
    "verify-julia-renderer-evidence-v2-runtime-binding-invalid",
  );

  const reports = reportPaths()
    .map((path) => parseReport(readJson(path, true)))
    .sort((left, right) => left.start - right.start);
  let expectedStart = 0;
  let renderer = "";
  const rawRows: JuliaRendererReportRowV2[] = [];
  for (const report of reports) {
    invariant(
      report.start === expectedStart &&
        report.candidateManifestContentHash === manifest.value.contentHash &&
        report.waveId === manifest.value.waveId &&
        report.preGpuContentHash === preGpu.value.contentHash &&
        report.executionSourceBindingsContentHash ===
          currentExecutionSourceBindingsContentHash &&
        report.workerBundleSha256 === currentWorkerBundleSha256 &&
        canonicalJsonV1(report.runtimeDependencyBindings, 64) ===
          canonicalJsonV1(workerAudit.runtimeDependencyBindings, 64) &&
        (renderer === "" || renderer === report.renderer),
      "verify-julia-renderer-evidence-v2-report-binding-invalid",
    );
    renderer = report.renderer;
    rawRows.push(...report.rows);
    expectedStart += report.rowCount;
  }
  invariant(
    expectedStart === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 &&
      rawRows.length === evidence.rows.length &&
      new Set(rawRows.map((row) => row.formulaId)).size === rawRows.length,
    "verify-julia-renderer-evidence-v2-report-set-invalid",
  );
  for (let index = 0; index < rawRows.length; index++) {
    const raw = rawRows[index];
    const row = evidence.rows[index];
    const candidate = manifest.value.rows[index];
    invariant(
      raw !== undefined &&
        row !== undefined &&
        candidate !== undefined &&
        raw.formulaId === candidate.formulaId &&
        raw.candidateContentHash === candidate.candidateContentHash &&
        raw.evaluatedSourceRevision === candidate.sourceRevision &&
        raw.evaluatedSemanticHash === candidate.semanticHash &&
        canonicalJsonV1(projection(raw), 64_000) ===
          canonicalJsonV1(row, 64_000),
      `verify-julia-renderer-evidence-v2-row-invalid:${index}`,
    );
  }

  const expectedSourceBindingPaths =
    buildJuliaRendererFullSourceBindingPathsV2(definitionPaths);
  const assertFullSourcesStable = (): void => {
    verifyJuliaRendererSourceBindingMapV2(
      evidence.sourceBindings,
      expectedSourceBindingPaths,
      (path) => readFileSync(join(ROOT, path), "utf8"),
    );
  };
  assertFullSourcesStable();

  const attemptManifest = readJson(
    privatePath(
      join(
        PRIVATE_ROOT,
        `holdout-attempt-manifest.wave-${manifest.value.waveId}.json`,
      ),
    ),
    true,
  );
  const sealedLedger = readJson(
    privatePath(
      join(
        PRIVATE_ROOT,
        `attempt-ledger.sealed-${manifest.value.waveId}.json`,
      ),
    ),
    true,
  );
  invariant(
    attemptManifest.schema ===
      "fractalpark-julia-pixel-holdout-attempt-manifest/v1" &&
      attemptManifest.waveId === manifest.value.waveId &&
      attemptManifest.rowCount === 0 &&
      Array.isArray(attemptManifest.rows) &&
      attemptManifest.rows.length === 0 &&
      attemptManifest.contentHash === contentHash(attemptManifest) &&
      evidence.sealedHoldout.attemptManifestContentHash ===
        attemptManifest.contentHash,
    "verify-julia-renderer-evidence-v2-attempt-manifest-invalid",
  );
  invariant(
    sealedLedger.schema ===
      "fractalpark-julia-pixel-holdout-attempt-ledger/v1" &&
      sealedLedger.stage === "sealed" &&
      sealedLedger.waveId === manifest.value.waveId &&
      sealedLedger.candidateManifestContentHash === manifest.value.contentHash &&
      Array.isArray(sealedLedger.attempts) &&
      sealedLedger.attempts.length === 0 &&
      sealedLedger.contentHash === contentHash(sealedLedger) &&
      evidence.sealedHoldout.sealedCorpusDigest ===
        sealedLedger.currentCorpusDigest &&
      evidence.sealedHoldout.sealedLedgerContentHash ===
        sealedLedger.contentHash,
    "verify-julia-renderer-evidence-v2-sealed-ledger-invalid",
  );
  assertExecutionSourcesStable();
  assertFullSourcesStable();
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      independentlyReplayed: true,
      rowCount: evidence.rows.length,
      passed: evidence.statusCounts.passed,
      blocked: evidence.statusCounts.blocked,
      renderer,
      waveId: evidence.waveId,
      contentHash: evidence.contentHash,
      sealedAttemptCount: 0,
    })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      code:
        error instanceof Error
          ? error.message
          : "verify-julia-renderer-evidence-v2-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
