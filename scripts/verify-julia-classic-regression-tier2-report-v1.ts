import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import correctiveAsset from "../resources/formula-library/v1/julia-classic-regression-corrective.v1.json";
import { hashFrmLikeV1, parseFrmLikeV1 } from "../src/engine/frm/v1";
import {
  parseJuliaClassicRegressionCorrectiveV1,
  type JuliaClassicRegressionCorrectiveRowV1,
} from "../src/engine/formulas/v1/julia-classic-regression-corrective-v1";
import {
  buildJuliaClassicRegressionRendererProfileV1,
} from "../src/engine/formulas/v1/julia-classic-regression-renderer-evidence-v1";
import {
  juliaClassicRegressionRendererReportContentHashV1,
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
const PRIVATE_ROOT = join(ROOT, PRIVATE_RELATIVE_ROOT);
const REPORT_ROOT = join(PRIVATE_ROOT, "renderer-v1-reports");
const WORKER_SOURCE = join(
  ROOT,
  "scripts/run-julia-classic-regression-tier2-webgl-worker-v1.ts",
);
const WORKER_BUNDLE = join(
  ROOT,
  "node_modules/.cache/julia-classic-regression-tier2-webgl-worker-v1.mjs",
);
const RUNTIME_INDEX_PATH = join(
  ROOT,
  "public/formula-library/v1/runtime/published/index.json",
);

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
  throw new Error(`verify-julia-classic-regression-tier2-report-v1:${code}`);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireRegularFile(
  path: string,
  mode: number,
  code: string,
): void {
  const stat = lstatSync(path);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (stat.mode & 0o777) !== mode
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

function executionSourceBindingsContentHash(
  paths: readonly string[],
): string {
  const bindings = Object.fromEntries(
    paths.map((path) => [path, sha256File(join(ROOT, path))]),
  );
  return createHash("sha256")
    .update(canonicalJsonV1(bindings, 64_000))
    .digest("hex");
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJsonV1(left, 65_536) === canonicalJsonV1(right, 65_536);
}

async function main(): Promise<void> {
  const reportArgument = process.argv.find((argument) =>
    argument.startsWith("--report="),
  );
  if (!reportArgument) fail("report-missing");

  const privateRoot = verifyPrivateEvidenceRoot(
    ROOT,
    PRIVATE_RELATIVE_ROOT,
    "verify-julia-classic-regression-tier2-report-v1-private-root-invalid",
  );
  const reportPath = resolve(reportArgument.slice("--report=".length));
  if (
    realpathSync(dirname(reportPath)) !== realpathSync(REPORT_ROOT) ||
    !realpathSync(reportPath).startsWith(`${privateRoot}${sep}`)
  )
    fail("private-location");
  requireRegularFile(reportPath, 0o600, "private-report-file");

  const parsedReport = parseJuliaClassicRegressionRendererReportV1(
    JSON.parse(readFileSync(reportPath, "utf8")),
  );
  if (!parsedReport.ok) fail(parsedReport.code);
  const report = parsedReport.value;

  const corrective = parseJuliaClassicRegressionCorrectiveV1(correctiveAsset);
  if (!corrective.ok) fail("corrective-invalid");
  const authority = corrective.value;
  if (
    report.candidateManifestContentHash !== authority.contentHash ||
    report.waveId !== authority.contentHash ||
    report.preGpuContentHash !== authority.contentHash
  )
    fail("corrective-content-hash");

  const runtime = parsePublishedFormulaRuntimeIndexV1(
    JSON.parse(readFileSync(RUNTIME_INDEX_PATH, "utf8")),
  );
  if (!runtime.ok) fail("runtime-index-invalid");
  const runtimeById = new Map(
    runtime.value.rows.map((row) => [row.formulaId, row]),
  );

  for (let index = 0; index < authority.rows.length; index += 1) {
    const correctiveRow = authority.rows[index];
    const reportRow = report.rows[index];
    if (!correctiveRow || !reportRow) fail(`row-missing:${index}`);
    const candidatePath = join(
      ROOT,
      "resources/formula-library/v1",
      correctiveRow.candidatePath,
    );
    requireRegularFile(candidatePath, 0o644, `candidate-file:${index}`);
    const candidateSource = readFileSync(candidatePath, "utf8");
    if (
      sha256File(candidatePath) !== correctiveRow.candidateSourceRevision ||
      reportRow.evaluatedSourceRevision !==
        correctiveRow.candidateSourceRevision
    )
      fail(`candidate-source:${index}`);
    const parsedCandidate = parseFrmLikeV1(candidateSource);
    if (!parsedCandidate.ok) fail(`candidate-semantic:${index}`);
    const candidateHashes = await hashFrmLikeV1(
      candidateSource,
      parsedCandidate.ir,
    );
    if (
      candidateHashes.sourceRevision !==
        correctiveRow.candidateSourceRevision ||
      candidateHashes.semanticHash !==
        correctiveRow.candidateSemanticHash ||
      reportRow.evaluatedSemanticHash !==
        correctiveRow.candidateSemanticHash
    )
      fail(`candidate-semantic:${index}`);
    if (
      reportRow.candidateContentHash !== correctiveRow.rowReceipt ||
      reportRow.bindingRevision !==
        correctiveRow.correctiveBindingRevision ||
      reportRow.supportLane !== correctiveRow.supportLane ||
      !sameCanonical(reportRow.binding, correctiveRow.binding)
    )
      fail(`row-binding:${index}`);
    const runtimeRow = runtimeById.get(correctiveRow.formulaId);
    if (!runtimeRow) fail(`runtime-row:${index}`);
    const expectedProfile = buildJuliaClassicRegressionRendererProfileV1(
      runtimeRow,
      correctiveRow,
    );
    if (reportRow.profileDigest !== expectedProfile.profileDigest)
      fail(`profile-digest:${index}`);
  }

  const sourcePaths = executionSourcePaths(authority.rows);
  const sourceHash = executionSourceBindingsContentHash(sourcePaths);
  if (report.executionSourceBindingsContentHash !== sourceHash)
    fail(`execution-bindings:${sourceHash}`);

  requireWorkerBundle(WORKER_BUNDLE);
  const workerAudit = auditJuliaWorkerBundleV2(
    ROOT,
    WORKER_SOURCE,
    WORKER_BUNDLE,
    WORKER_AUDIT_SOURCE_PATHS,
    false,
  );
  if (
    workerAudit.bundleSha256 !== report.workerBundleSha256 ||
    sha256File(WORKER_BUNDLE) !== report.workerBundleSha256 ||
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

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      rowCount: report.rows.length,
      reportContentHash:
        juliaClassicRegressionRendererReportContentHashV1(report),
      privateReportWholeSha256: sha256File(reportPath),
      executionSourceBindingsContentHash: sourceHash,
      workerBundleSha256: report.workerBundleSha256,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
