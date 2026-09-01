import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import correctiveAsset from "../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import evidenceAsset from "../resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import {
  parseJuliaClassicRegressionCorrectiveV1,
  type JuliaClassicRegressionCorrectiveRowV1,
} from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import {
  buildJuliaClassicRegressionRendererProfileV1,
} from "../src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1";
import {
  juliaClassicRegressionRendererEvidenceContentHashV1,
  juliaClassicRegressionRendererEvidenceRowReceiptV1,
  juliaClassicRegressionRendererReportContentHashV1,
  parseJuliaClassicRegressionRendererEvidenceV1,
  parseJuliaClassicRegressionRendererReportV1,
} from "../src/engine/formulas/v1/julia-classic-regression-renderer-closure-v1";
import { JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2 } from "../src/engine/formulas/v1/julia-renderer-source-bindings-v2";
import {
  parsePublishedFormulaRuntimeIndexV1,
} from "../src/engine/formulas/v1/published-runtime";
import { canonicalJsonV1 } from "../src/engine/formulas/v1/revisions";
import { verifyPrivateEvidenceRoot } from "./lib/julia-private-evidence-root";
import {
  auditJuliaRuntimeDependenciesV2,
  auditJuliaWorkerBundleV2,
} from "./lib/julia-worker-bundle-audit";

const ROOT = process.cwd();
const PRIVATE_RELATIVE_ROOT =
  ".formula-library-private/julia-classic-regression-corrective-v1";
const REPORT_ROOT = join(ROOT, PRIVATE_RELATIVE_ROOT, "renderer-v1-reports");
const ASSET_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-classic-regression-renderer-evidence.v1.json",
);
const CORRECTIVE_PATH = join(
  ROOT,
  "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);
const WORKER_SOURCE = join(
  ROOT,
  "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
);
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/julia-classic-regression-tier2-webgl-worker-v1.mjs",
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
const WORKER_AUDIT_SOURCE_PATHS = Object.freeze([
  "resources/formula-library/v1/julia-capability-census.v1.json",
  "resources/formula-library/v1/julia-classic-regression-corrective.v1.json",
  "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
  "src/engine/formulas/v1/julia-capability.ts",
  "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
  "src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1.ts",
  "src/engine/formulas/v1/published-adapter.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/v1.ts",
  "src/engine/plugins/builtins/coloring/inside-black.ts",
  "src/engine/plugins/builtins/coloring/smooth.ts",
  "src/engine/plugins/builtins/transforms/none.ts",
  "src/engine/plugins/registry.ts",
  "src/engine/shaders/assembler.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/shaders/framework.frag.glsl",
  "src/engine/shaders/palettes.glsl",
]);

function fail(code: string): never {
  throw new Error(
    `verify-julia-classic-regression-renderer-evidence-v1:${code}`,
  );
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireRegularFile(path: string, mode: number, code: string): void {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== mode
  )
    fail(code);
}

function requirePublicFile(path: string, code: string): void {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o113) !== 0
  )
    fail(code);
}

function requireWorkerBundle(path: string): void {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o113) !== 0
  )
    fail("worker-bundle-file");
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJsonV1(left, 131_072) === canonicalJsonV1(right, 131_072);
}

function executionSourcePaths(
  rows: readonly JuliaClassicRegressionCorrectiveRowV1[],
): readonly string[] {
  return [
    ...new Set([
      ...JULIA_RENDERER_EXECUTION_SOURCE_BINDING_PATHS_V2,
      "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
      "scripts/verify-julia-classic-regression-tier2-webgl-v1.ts",
      "src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1.ts",
      "src/engine/formulas/v1/julia-classic-regression-corrective-v1.ts",
      ...rows.map(
        (row) => `resources/formula-library/v1/${row.candidatePath}`,
      ),
    ]),
  ].sort();
}

function executionSourceHash(paths: readonly string[]): string {
  const bindings = Object.fromEntries(
    paths.map((path) => [path, sha256File(join(ROOT, path))]),
  );
  return createHash("sha256")
    .update(canonicalJsonV1(bindings, 64_000))
    .digest("hex");
}

async function main(): Promise<void> {
  const reportArgument = process.argv.find((argument) =>
    argument.startsWith("--report="),
  );
  if (!reportArgument) fail("report-missing");
  const privateRoot = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "verify-julia-classic-regression-renderer-evidence-v1-private-root-invalid",
  );
  const reportPath = resolve(reportArgument.slice("--report=".length));
  if (
    realpathSync(dirname(reportPath)) !== realpathSync(REPORT_ROOT) ||
    !realpathSync(reportPath).startsWith(`${privateRoot}${sep}`)
  )
    fail("private-location");
  requireRegularFile(reportPath, 0o600, "private-report-file");
  requirePublicFile(ASSET_PATH, "public-evidence-file");
  requirePublicFile(CORRECTIVE_PATH, "corrective-file");

  const parsedReport = parseJuliaClassicRegressionRendererReportV1(
    JSON.parse(readFileSync(reportPath, "utf8")),
  );
  const parsedEvidence = parseJuliaClassicRegressionRendererEvidenceV1(
    evidenceAsset,
  );
  const parsedCorrective = parseJuliaClassicRegressionCorrectiveV1(
    correctiveAsset,
  );
  if (!parsedReport.ok) fail(parsedReport.code);
  if (!parsedEvidence.ok) fail(parsedEvidence.code);
  if (!parsedCorrective.ok) fail("corrective-invalid");
  const report = parsedReport.value;
  const evidence = parsedEvidence.value;
  const corrective = parsedCorrective.value;

  if (
    evidence.correctiveContentHash !== corrective.contentHash ||
    evidence.correctiveWholeFileSha256 !== sha256File(CORRECTIVE_PATH) ||
    evidence.privateReportWholeSha256 !== sha256File(reportPath) ||
    evidence.privateReportContentHash !==
      juliaClassicRegressionRendererReportContentHashV1(report) ||
    evidence.executionSourceBindingsContentHash !==
      report.executionSourceBindingsContentHash ||
    evidence.workerBundleSha256 !== report.workerBundleSha256 ||
    !sameCanonical(
      evidence.runtimeDependencyBindings,
      report.runtimeDependencyBindings,
    ) ||
    evidence.renderer !== report.renderer ||
    evidence.durationMs !== report.durationMs ||
    evidence.idsSha256 !== report.idsSha256 ||
    !sameCanonical(evidence.statusCounts, report.statusCounts)
  )
    fail("top-level-authority");

  const runtime = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  if (!runtime.ok) fail("runtime-index-invalid");
  const runtimeById = new Map(
    runtime.value.rows.map((row) => [row.formulaId, row]),
  );

  for (let index = 0; index < corrective.rows.length; index += 1) {
    const correctiveRow = corrective.rows[index];
    const reportRow = report.rows[index];
    const evidenceRow = evidence.rows[index];
    if (!correctiveRow || !reportRow || !evidenceRow)
      fail(`row-missing:${index}`);
    const reportProjection = Object.fromEntries(
      Object.keys(reportRow).map((key) => [
        key,
        evidenceRow[key as keyof typeof evidenceRow],
      ]),
    );
    if (!sameCanonical(reportProjection, reportRow))
      fail(`report-projection:${index}`);
    const { receipt, ...receiptBody } = evidenceRow;
    if (
      receipt !==
      juliaClassicRegressionRendererEvidenceRowReceiptV1(receiptBody)
    )
      fail(`row-receipt:${index}`);

    const candidatePath = join(
      ROOT,
      "resources/formula-library/v1",
      correctiveRow.candidatePath,
    );
    requireRegularFile(candidatePath, 0o644, `candidate-file:${index}`);
    const candidateSource = readFileSync(candidatePath, "utf8");
    const parsedCandidate = parseFrmLikeV1(candidateSource);
    if (!parsedCandidate.ok) fail(`candidate-parse:${index}`);
    const candidateHashes = await hashFrmLikeV1(
      candidateSource,
      parsedCandidate.ir,
    );
    if (
      candidateHashes.sourceRevision !==
        correctiveRow.candidateSourceRevision ||
      candidateHashes.semanticHash !== correctiveRow.candidateSemanticHash ||
      reportRow.candidateContentHash !== correctiveRow.rowReceipt ||
      reportRow.bindingRevision !==
        correctiveRow.correctiveBindingRevision ||
      reportRow.supportLane !== correctiveRow.supportLane ||
      !sameCanonical(reportRow.binding, correctiveRow.binding)
    )
      fail(`candidate-authority:${index}`);
    const runtimeRow = runtimeById.get(correctiveRow.formulaId);
    if (!runtimeRow) fail(`runtime-row:${index}`);
    if (
      buildJuliaClassicRegressionRendererProfileV1(
        runtimeRow,
        correctiveRow,
      ).profileDigest !== reportRow.profileDigest
    )
      fail(`profile-digest:${index}`);
  }

  const expectedSourcePaths = [
    ...new Set([
      ...STATIC_SOURCE_BINDING_PATHS,
      ...corrective.rows.map(
        (row) => `resources/formula-library/v1/${row.candidatePath}`,
      ),
      ...Object.keys(corrective.sourceBindings),
    ]),
  ].sort();
  const actualSourcePaths = Object.keys(evidence.sourceBindings).sort();
  if (!sameCanonical(actualSourcePaths, expectedSourcePaths))
    fail("source-binding-set");
  for (const path of expectedSourcePaths) {
    if (evidence.sourceBindings[path] !== sha256File(join(ROOT, path)))
      fail(`source-binding:${path}`);
  }

  const currentExecutionSourceHash = executionSourceHash(
    executionSourcePaths(corrective.rows),
  );
  if (
    currentExecutionSourceHash !==
      evidence.executionSourceBindingsContentHash ||
    currentExecutionSourceHash !== report.executionSourceBindingsContentHash
  )
    fail(`execution-source-hash:${currentExecutionSourceHash}`);

  requireWorkerBundle(WORKER_BUNDLE);
  const workerAudit = auditJuliaWorkerBundleV2(
    ROOT,
    WORKER_SOURCE,
    WORKER_BUNDLE,
    WORKER_AUDIT_SOURCE_PATHS,
    false,
  );
  if (
    sha256File(WORKER_BUNDLE) !== report.workerBundleSha256 ||
    workerAudit.bundleSha256 !== report.workerBundleSha256 ||
    !sameCanonical(
      workerAudit.runtimeDependencyBindings,
      report.runtimeDependencyBindings,
    ) ||
    !sameCanonical(
      auditJuliaRuntimeDependenciesV2(ROOT),
      report.runtimeDependencyBindings,
    )
  )
    fail("worker-runtime-binding");

  const { contentHash, ...body } = evidence;
  if (
    contentHash !==
      juliaClassicRegressionRendererEvidenceContentHashV1(body)
  )
    fail("content-hash");

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      rowCount: evidence.rows.length,
      passed: evidence.statusCounts.passed,
      blocked: evidence.statusCounts.blocked,
      contentHash: evidence.contentHash,
      wholeFileSha256: sha256File(ASSET_PATH),
      reportContentHash: evidence.privateReportContentHash,
      executionSourceBindingsContentHash:
        evidence.executionSourceBindingsContentHash,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
