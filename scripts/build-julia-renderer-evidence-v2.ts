import { lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
  JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
  parseJuliaRendererEvidenceV2,
  type JuliaRendererEvidenceRowV2,
  type JuliaRendererReportRowV2,
} from "../src/engine/formulas/v1/julia-renderer-evidence-v2";
import {
  buildJuliaRendererDefinitionBindingPathsV2,
  buildJuliaRendererExecutionSourceBindingPathsV2,
  buildJuliaRendererFullSourceBindingPathsV2,
  buildJuliaRendererSourceBindingContentHashV2,
  buildJuliaRendererSourceBindingMapV2,
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
const OUTPUT_PATH = join(
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
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function contentHash(value: JsonRecord): string {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== "contentHash"),
  );
  return sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET));
}

function readJsonFile(path: string, requirePrivateMode: boolean): JsonRecord {
  const stat = lstatSync(path);
  invariant(
    stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
    "julia-renderer-evidence-v2-input-file-invalid",
  );
  if (requirePrivateMode)
    invariant(
      (stat.mode & 0o777) === 0o600 && stat.uid === process.getuid?.(),
      "julia-renderer-evidence-v2-input-mode-invalid",
    );
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  invariant(record(value), "julia-renderer-evidence-v2-input-json-invalid");
  return value;
}

function privatePath(path: string): string {
  const root = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "julia-renderer-evidence-v2-private-root-invalid",
  );
  return verifyPrivateEvidenceFile(
    root,
    path,
    "julia-renderer-evidence-v2-private-path-escape",
  );
}

function reportArguments(): string[] {
  const reports = process.argv
    .filter((argument) => argument.startsWith("--report="))
    .map((argument) =>
      privatePath(resolve(argument.slice("--report=".length))),
    );
  invariant(reports.length > 0, "julia-renderer-evidence-v2-report-missing");
  return reports;
}

interface ParsedReport {
  readonly start: number;
  readonly rowCount: number;
  readonly renderer: string;
  readonly candidateManifestContentHash: string;
  readonly waveId: string;
  readonly preGpuContentHash: string;
  readonly executionSourceBindingsContentHash: string;
  readonly workerBundleSha256: string;
  readonly runtimeDependencyBindings: Readonly<Record<string, string>>;
  readonly rows: readonly JuliaRendererReportRowV2[];
}

function parseReport(value: JsonRecord): ParsedReport {
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
      typeof value.fullGate === "boolean" &&
      Number.isSafeInteger(value.chunkSize) &&
      typeof value.renderer === "string" &&
      value.renderer.includes("SwiftShader") &&
      Number.isSafeInteger(value.durationMs) &&
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
      typeof value.idsSha256 === "string" &&
      SHA256.test(value.idsSha256) &&
      record(value.statusCounts) &&
      Number.isSafeInteger(value.statusCounts.passed) &&
      Number.isSafeInteger(value.statusCounts.blocked) &&
      Array.isArray(value.rows) &&
      value.rowCount === value.rows.length,
    "julia-renderer-evidence-v2-report-invalid",
  );
  return value as unknown as ParsedReport;
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

function canonicalRow(row: JuliaRendererReportRowV2): JuliaRendererEvidenceRowV2 {
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

function sourceBindings(definitionPaths: readonly string[]): Record<string, string> {
  const paths = buildJuliaRendererFullSourceBindingPathsV2(definitionPaths);
  return buildJuliaRendererSourceBindingMapV2(
    paths,
    (path) => readFileSync(join(ROOT, path), "utf8"),
  );
}

function main(): void {
  const preGpu = parseJuliaPreGpuRecoveryCensusV2(preGpuAsset);
  invariant(preGpu.ok, "julia-renderer-evidence-v2-pre-gpu-invalid");
  const manifest = parseJuliaPixelCandidateManifestV1(
    manifestAsset,
    preGpu.value,
  );
  invariant(manifest.ok, "julia-renderer-evidence-v2-manifest-invalid");
  const candidates = parseJuliaPixelRecoveryCandidatesV1(candidateAsset);
  const runtime = parsePublishedFormulaRuntimeIndexV1(runtimeAsset);
  invariant(
    candidates.ok && runtime.ok,
    "julia-renderer-evidence-v2-definition-authority-invalid",
  );
  const definitionPaths = buildJuliaRendererDefinitionBindingPathsV2(
    preGpu.value.rows,
    runtime.value.rows,
    candidates.value.rows,
  );
  invariant(
    manifest.value.rows.length === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 &&
      manifest.value.rows.every(
        (row) => String(row.rewriteClass) === "E0-operational-equivalence",
      ),
    "julia-renderer-evidence-v2-rewrite-set-invalid",
  );
  const currentSourceBindings = sourceBindings(definitionPaths);
  const currentExecutionSourceBindingsContentHash =
    buildJuliaRendererSourceBindingContentHashV2(
      buildJuliaRendererExecutionSourceBindingPathsV2(definitionPaths),
      (path) => readFileSync(join(ROOT, path), "utf8"),
    );
  const assertSourceBindingsStable = (): void => {
    invariant(
      buildJuliaRendererSourceBindingContentHashV2(
        buildJuliaRendererExecutionSourceBindingPathsV2(definitionPaths),
        (path) => readFileSync(join(ROOT, path), "utf8"),
      ) === currentExecutionSourceBindingsContentHash &&
        canonicalJsonV1(sourceBindings(definitionPaths), CANONICAL_NODE_BUDGET) ===
          canonicalJsonV1(currentSourceBindings, CANONICAL_NODE_BUDGET),
      "julia-renderer-evidence-v2-source-drift",
    );
  };
  const workerAudit = auditJuliaWorkerBundleV2(
    ROOT,
    WORKER_SOURCE,
    WORKER_BUNDLE,
    buildJuliaRendererExecutionSourceBindingPathsV2(definitionPaths),
    false,
  );
  assertSourceBindingsStable();
  const currentWorkerBundleSha256 = workerAudit.bundleSha256;

  const reports = reportArguments()
    .map((path) => parseReport(readJsonFile(path, true)))
    .sort((left, right) => left.start - right.start);
  let expectedStart = 0;
  const rows: JuliaRendererReportRowV2[] = [];
  let renderer = "";
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
      "julia-renderer-evidence-v2-report-binding-invalid",
    );
    renderer = report.renderer;
    rows.push(...report.rows);
    expectedStart += report.rowCount;
  }
  invariant(
    expectedStart === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 &&
      rows.length === JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 &&
      rows.every((row, index) => {
        const candidate = manifest.value.rows[index];
        return (
          candidate !== undefined &&
          row.formulaId === candidate.formulaId &&
          row.candidateContentHash === candidate.candidateContentHash &&
          row.evaluatedSourceRevision === candidate.sourceRevision &&
          row.evaluatedSemanticHash === candidate.semanticHash
        );
      }),
    "julia-renderer-evidence-v2-row-set-invalid",
  );

  const attemptManifestPath = privatePath(
    join(
      PRIVATE_ROOT,
      `holdout-attempt-manifest.wave-${manifest.value.waveId}.json`,
    ),
  );
  const sealedLedgerPath = privatePath(
    join(
      PRIVATE_ROOT,
      `attempt-ledger.sealed-${manifest.value.waveId}.json`,
    ),
  );
  const attemptManifest = readJsonFile(attemptManifestPath, true);
  const sealedLedger = readJsonFile(sealedLedgerPath, true);
  invariant(
    attemptManifest.schema ===
      "fractalpark-julia-pixel-holdout-attempt-manifest/v1" &&
      attemptManifest.waveId === manifest.value.waveId &&
      attemptManifest.candidateManifestContentHash === manifest.value.contentHash &&
      attemptManifest.rowCount === 0 &&
      Array.isArray(attemptManifest.rows) &&
      attemptManifest.rows.length === 0 &&
      typeof attemptManifest.contentHash === "string" &&
      attemptManifest.contentHash === contentHash(attemptManifest),
    "julia-renderer-evidence-v2-attempt-manifest-invalid",
  );
  invariant(
    sealedLedger.schema ===
      "fractalpark-julia-pixel-holdout-attempt-ledger/v1" &&
      sealedLedger.revision === 1 &&
      sealedLedger.stage === "sealed" &&
      sealedLedger.waveId === manifest.value.waveId &&
      sealedLedger.candidateManifestContentHash === manifest.value.contentHash &&
      typeof sealedLedger.currentCorpusDigest === "string" &&
      SHA256.test(sealedLedger.currentCorpusDigest) &&
      Array.isArray(sealedLedger.attempts) &&
      sealedLedger.attempts.length === 0 &&
      typeof sealedLedger.predecessorContentHash === "string" &&
      SHA256.test(sealedLedger.predecessorContentHash) &&
      typeof sealedLedger.contentHash === "string" &&
      sealedLedger.contentHash === contentHash(sealedLedger),
    "julia-renderer-evidence-v2-sealed-ledger-invalid",
  );

  const evidenceRows = rows.map(canonicalRow);
  const passed = evidenceRows.filter((row) => row.status === "passed").length;
  const blocked = evidenceRows.length - passed;
  invariant(
    evidenceRows.filter((row) => row.fullFrameworkCappedDraw).length === 1 &&
      evidenceRows.find((row) => row.fullFrameworkCappedDraw)?.formulaId ===
        JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
    "julia-renderer-evidence-v2-integration-witness-invalid",
  );
  const content = {
    schema: "fractalpark-julia-renderer-evidence/v2" as const,
    revision: 2 as const,
    stage: "tier2-renderer-v2-closure" as const,
    authority: {
      authorityState: "sealed" as const,
      supersededBy: null,
      withdrawnBy: null,
    },
    activationStatus: "inactive-evidence-only" as const,
    rendererPolicy: "Chromium-WebGL2-SwiftShader-software" as const,
    runtimeDependencyBindings: workerAudit.runtimeDependencyBindings,
    tier3Scope: {
      physicalDeviceSampleCount: 0,
      crossDeviceGuarantee: false,
    },
    candidateManifestContentHash: manifest.value.contentHash,
    waveId: manifest.value.waveId,
    preGpuContentHash: preGpu.value.contentHash,
    integrationWitnessFormulaId:
      JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2,
    integrationWitnessCount: 1 as const,
    traceContract: {
      orbitSteps: 128 as const,
      stateDimensions: 18 as const,
      stateComparisonsPerRow: 2304 as const,
      flagComparisonsPerRow: 2304 as const,
    },
    imageContract: {
      width: 8 as const,
      height: 6 as const,
      iterations: 32 as const,
      constantCount: 2 as const,
      pixelComparisonsPerRow: 96 as const,
      minimumDifferingPixels: 1 as const,
      relativeTolerance: 0.005 as const,
    },
    sealedHoldout: {
      stage: "sealed" as const,
      candidateManifestContentHash: manifest.value.contentHash,
      waveId: manifest.value.waveId,
      sealedCorpusDigest: sealedLedger.currentCorpusDigest as string,
      e1CandidateCount: 0 as const,
      sealedAttemptCount: 0 as const,
      attemptManifestContentHash: attemptManifest.contentHash as string,
      sealedLedgerContentHash: sealedLedger.contentHash as string,
    },
    sourceBindings: currentSourceBindings,
    rowCount: JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2,
    statusCounts: { passed, blocked },
    rows: evidenceRows,
  };
  const artifact = {
    ...content,
    contentHash: sha256HexSyncV1(
      canonicalJsonV1(content, CANONICAL_NODE_BUDGET),
    ),
  };
  const parsed = parseJuliaRendererEvidenceV2(artifact);
  invariant(parsed.ok, "julia-renderer-evidence-v2-self-parse-invalid");
  assertSourceBindingsStable();
  const output = `${JSON.stringify(artifact, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    const temporary = `${OUTPUT_PATH}.tmp-${process.pid}`;
    writeFileSync(temporary, output, { mode: 0o600 });
    renameSync(temporary, OUTPUT_PATH);
  }
  assertSourceBindingsStable();
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      write: process.argv.includes("--write"),
      rowCount: evidenceRows.length,
      passed,
      blocked,
      renderer,
      waveId: manifest.value.waveId,
      contentHash: artifact.contentHash,
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
          : "julia-renderer-evidence-v2-build-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
