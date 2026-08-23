import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";

import type { PublishedFormulaRuntimeIndexV1 } from "../src/engine/formulas/v1/published-runtime";
import { PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE } from "../src/lib/published-formula-library";

type JsonRecord = Record<string, unknown>;

interface PerformanceGateConfig {
  readonly schema: "fractalpark-standard-library-performance-gates/v1";
  readonly decisionRevision: number;
  readonly publicationDecisionsContentHash: string;
  readonly counts: {
    readonly decisions: number;
    readonly published: number;
    readonly held: number;
    readonly excluded: number;
    readonly initialLibraryRows: number;
  };
  readonly measurementContract: {
    readonly libraryOpenSamples: number;
    readonly libraryHeapDeltaSamples: number;
    readonly previewDecodeSamples: number;
    readonly coldSelectionSamples: number;
    readonly hotSelectionSamples: number;
    readonly facetPaintSamples: number;
    readonly selectedLoadingSamples: number;
    readonly facetPercentile: number;
    readonly framePercentile: number;
    readonly responsiveWidths: readonly number[];
    readonly coldCacheMode: string;
    readonly hotCacheMode: string;
    readonly requiredTuple: readonly string[];
  };
  readonly budgets: {
    readonly staticAssets: {
      readonly publishedIndexBytes: number;
      readonly publishedManifestBytes: number;
      readonly definitionsTotalBytes: number;
      readonly definitionMaxBytes: number;
      readonly previewManifestBytes: number;
      readonly previewsTotalBytes: number;
      readonly previewMaxBytes: number;
      readonly nativeDefinitionOverlapCount: number;
      readonly nativeDefinitionOverlapSha256: string;
    };
    readonly browser: {
      readonly libraryOpenP95Ms: number;
      readonly libraryDialogDescendants: number;
      readonly libraryHeapDeltaP95Bytes: number;
      readonly publishedIndexTransferBytes: number;
      readonly facetPaintP75Ms: number;
      readonly selectedLoadingMaxMs: number;
      readonly previewDecodeP95Ms: number;
      readonly initialFormulaAssetRequests: number;
      readonly hotFormulaAssetRequests: number;
      readonly coldSelectionToCorrectFrameDesktopP95Ms: number;
      readonly coldSelectionToCorrectFrameMobileP95Ms: number;
      readonly hotSelectionToCorrectFrameP95Ms: number;
    };
    readonly build: Record<string, number>;
  };
  readonly releaseDevices: readonly string[];
  readonly rollbackContract: {
    readonly requiredDeployedSteps: readonly string[];
  };
  readonly accessibilityContract: {
    readonly requiredScreenReaderTasks: readonly string[];
  };
  readonly deviceTaskContract: {
    readonly desktopPerformanceTasks: readonly string[];
    readonly touchPerformanceTasks: readonly string[];
  };
}

interface PublicationDecisions {
  readonly decisionRevision: number;
  readonly contentHash: string;
  readonly formulaCount: number;
  readonly decisionCounts: {
    readonly publish: number;
    readonly hold: number;
    readonly exclude: number;
  };
  readonly rows: readonly {
    readonly formulaId: string;
    readonly publicationDecision: "publish" | "hold" | "exclude";
  }[];
}

interface PreviewManifest {
  readonly decisionRevision: number;
  readonly publicationDecisionsContentHash: string;
  readonly rowCount: number;
  readonly rows: readonly { readonly formulaId: string; readonly file: string }[];
}

interface ArtifactBinding {
  readonly path: string;
  readonly sha256: string;
}

interface DeviceEnvironment {
  readonly deviceModel: string;
  readonly osVersion: string;
  readonly browserVersion: string;
  readonly viewport: string;
  readonly inputMethod: string;
  readonly gpuVendor: string;
  readonly renderer: string;
  readonly physicalDevice: boolean;
  readonly emulator: boolean;
  readonly artifact: ArtifactBinding;
}

interface ReleaseEvidence {
  readonly schema: "fractalpark-standard-library-performance-evidence/v1";
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly browser: {
    readonly gitCommit: string;
    readonly targetUrl: string;
    readonly environment: {
      readonly browser: string;
      readonly cacheMode: string;
    } & DeviceEnvironment;
    readonly coldSelectionSamples: readonly number[];
    readonly hotSelectionSamples: readonly number[];
    readonly facetPaintSamples: readonly number[];
    readonly selectedLoadingSamples: readonly number[];
    readonly libraryOpenSamples: readonly number[];
    readonly libraryHeapDeltaSamples: readonly number[];
    readonly previewDecodeSamples: readonly number[];
    readonly libraryDialogDescendants: number;
    readonly publishedIndexTransferBytes: number;
    readonly initialFormulaAssetRequests: number;
    readonly hotFormulaAssetRequests: number;
  };
  readonly build: {
    readonly wallMs: number;
    readonly maxRssBytes: number;
    readonly generatedPages: number;
  };
  readonly devices: readonly {
    readonly id: string;
    readonly status: "pass" | "fail" | "pending";
    readonly gitCommit: string;
    readonly targetUrl: string;
    readonly environment: DeviceEnvironment;
  }[];
  readonly accessibility: {
    readonly status: "pass" | "fail" | "pending";
    readonly artifact: ArtifactBinding;
  };
  readonly rollbackDrill: {
    readonly writerOff: RollbackScenarioEvidence;
    readonly featureOff: RollbackScenarioEvidence;
    readonly lkgRuntime: RollbackScenarioEvidence;
    readonly readerFloor: RollbackScenarioEvidence;
    readonly aliasResolver: RollbackScenarioEvidence;
    readonly deployedPreview: RollbackScenarioEvidence;
  };
}

interface RollbackScenarioEvidence {
  readonly status: "pass" | "fail" | "pending";
  readonly artifact: ArtifactBinding;
}

interface RollbackScenarioArtifact {
  readonly schema: "fractalpark-standard-library-rollback-run/v1";
  readonly scenarioId: RollbackScenarioId;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly command: string;
  readonly gitCommit?: string;
  readonly targetUrl?: string;
  readonly result: {
    readonly status: "pass" | "fail";
    readonly exitCode: number;
    readonly testFiles: readonly string[];
    readonly tests: number;
    readonly steps?: readonly {
      readonly name: string;
      readonly status: "pass" | "fail";
    }[];
  };
}

interface DeviceRunArtifact {
  readonly schema: "fractalpark-standard-library-device-run/v1";
  readonly deviceId: string;
  readonly gitCommit: string;
  readonly targetUrl: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly environment: Omit<DeviceEnvironment, "artifact">;
  readonly kind: "performance" | "screen-reader";
  readonly cacheMode?: string;
  readonly metrics?: {
    readonly facetPaintSamples: readonly number[];
    readonly selectedLoadingSamples: readonly number[];
    readonly coldSelectionSamples: readonly number[];
    readonly hotSelectionSamples: readonly number[];
    readonly initialFormulaAssetRequests: number;
    readonly hotFormulaAssetRequests: number;
  };
  readonly tasks: readonly {
    readonly name: string;
    readonly durationMs: number;
    readonly status: "pass" | "fail";
  }[];
}

interface BrowserMeasurementArtifact {
  readonly schema: "fractalpark-standard-library-browser-measurement/v1";
  readonly releaseQualifying: boolean;
  readonly gitCommit: string;
  readonly targetUrl: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly environment: {
    readonly browser: string;
    readonly browserVersion: string;
    readonly deviceModel: string;
    readonly osVersion: string;
    readonly viewport: string;
    readonly inputMethod: string;
    readonly cacheMode: string;
    readonly webgl: { readonly vendor: string; readonly renderer: string };
    readonly physicalDevice: boolean;
    readonly emulator: boolean;
  };
  readonly samples: Omit<ReleaseEvidence["browser"], "environment">;
}

const root = process.cwd();
const paths = {
  config: "resources/formula-library/v1/performance-gates.v1.json",
  decisions: "resources/formula-library/v1/publication-decisions.json",
  index: "public/formula-library/v1/runtime/published/index.json",
  manifest: "public/formula-library/v1/runtime/published/manifest.json",
  definitions: "public/formula-library/v1/runtime/published/definitions",
  previewManifest: "public/formula-library/v1/previews/manifest.json",
  previews: "public/formula-library/v1/previews",
  evidence: "resources/formula-library/v1/performance-evidence.v1.json",
} as const;

const releaseSourcePaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/release.yml",
  paths.config,
  paths.decisions,
  paths.index,
  paths.manifest,
  paths.previewManifest,
  "resources/formula-library/v1/recovery-evidence/transcendental-v1/cross-check.json",
  "resources/formula-library/v1/recovery-evidence/transcendental-v1/manifest.json",
  "src/components/fractal/FractalCanvas.tsx",
  "src/components/fractal/PublishedFormulaLibrary.tsx",
  "src/components/gallery/PresetThumbnail.tsx",
  "src/hooks/useFractalRenderer.ts",
  "src/lib/published-formula-library.ts",
  "src/lib/published-formula-selection.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/native-recipes.ts",
  "src/engine/formulas/v1/native-recipes-b94-classic.ts",
  "src/engine/formulas/v1/native-recipes-b94-clamps.ts",
  "src/engine/formulas/v1/native-recipes-b94-held.ts",
  "src/engine/formulas/v1/native-recipes-b94-recovered-transcendental.ts",
  "src/engine/formulas/v1/native-recipes-b94-newton.ts",
  "src/engine/formulas/v1/native-recipes-b94-transcendental.ts",
  "src/engine/fractals/renderer.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/plugins/builtins/formulas/recoveredTranscendentalMath.ts",
  "src/test/document-v3-envelope-v2.test.ts",
  "src/test/formula-portable-lifecycle-v1.test.ts",
  "src/test/formula-publication-decisions.test.ts",
  "src/test/formula-native-recipes.test.ts",
  "src/test/formula-resolver.test.ts",
  "src/test/formula-runtime-rev4.test.ts",
  "src/test/formula-transcendental-recovery-evidence.test.ts",
  "src/test/frm-v1-backend.test.ts",
  "src/test/frm-v1-stdlib.test.ts",
  "src/test/published-formula-adapter.test.ts",
  "src/test/published-formula-library.test.tsx",
  "src/test/published-formula-runtime.test.ts",
  "src/test/published-formula-selection.test.ts",
  "src/test/fractal-renderer-race.test.ts",
  "scripts/measure-standard-library-performance.ts",
  "scripts/cross-check-native-recipes.ts",
  "scripts/formula-library-bulk-migration.ts",
  "scripts/generate-transcendental-recovery-evidence.ts",
  "scripts/verify-standard-library-performance.ts",
  "tests/e2e/formula-switch.spec.ts",
  "package.json",
  "package-lock.json",
] as const;

const localRollbackScenarioIds = [
  "writerOff",
  "featureOff",
  "lkgRuntime",
  "readerFloor",
  "aliasResolver",
] as const;
type RollbackScenarioId =
  | (typeof localRollbackScenarioIds)[number]
  | "deployedPreview";

const softwareRendererPattern =
  /swiftshader|llvmpipe|softpipe|lavapipe|software rasterizer|microsoft basic render|virgl|virtualbox|vmware|paravirtual/i;
const hardwareRendererPattern =
  /nvidia|geforce|quadro|amd|ati|radeon|intel|apple|adreno|mali|powervr|qualcomm|arc\b/i;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8")) as T;
}

function fileBytes(relativePath: string): number {
  return statSync(join(root, relativePath)).size;
}

function directorySizes(relativePath: string, suffix: string): number[] {
  return readdirSync(join(root, relativePath))
    .filter((name) => name.endsWith(suffix))
    .map((name) => statSync(join(root, relativePath, name)).size);
}

function recursiveFiles(relativePath: string): string[] {
  if (!existsSync(join(root, relativePath))) return [];
  return readdirSync(join(root, relativePath), { withFileTypes: true }).flatMap(
    (entry) => {
      const child = join(relativePath, entry.name);
      return entry.isDirectory() ? recursiveFiles(child) : [child];
    },
  );
}

function verifyTrustedReleaseCandidate(evidence: ReleaseEvidence): void {
  const checkoutCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const expectedCandidate = process.env.FORMULA_PERFORMANCE_CANDIDATE_SHA;
  const expectedTarget = process.env.FORMULA_PERFORMANCE_TARGET_URL;
  let measuredCommitIsAncestor = false;
  let descendantChangesAreEvidenceOnly = false;
  if (isGitCommit(evidence.browser.gitCommit)) {
    try {
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", evidence.browser.gitCommit, checkoutCommit],
        { cwd: root, stdio: "ignore" },
      );
      measuredCommitIsAncestor = true;
      const changedPaths = execFileSync(
        "git",
        [
          "diff",
          "--name-only",
          "-z",
          "--no-renames",
          evidence.browser.gitCommit,
          checkoutCommit,
          "--",
        ],
        { cwd: root },
      )
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      descendantChangesAreEvidenceOnly = changedPaths.every(
        (path) =>
          path ===
            "resources/formula-library/v1/performance-evidence.v1.json" ||
          path.startsWith(
            "resources/formula-library/v1/device-evidence/",
          ) ||
          path.startsWith(
            "resources/formula-library/v1/rollback-evidence/",
          ),
      );
    } catch {
      measuredCommitIsAncestor = false;
      descendantChangesAreEvidenceOnly = false;
    }
  }
  invariant(
    isGitCommit(expectedCandidate) &&
      expectedCandidate === checkoutCommit &&
      evidence.browser.gitCommit !== checkoutCommit &&
      measuredCommitIsAncestor &&
      descendantChangesAreEvidenceOnly,
    "performance-evidence-release-candidate-sha-invalid",
  );
  invariant(
    isTrustedReleaseTargetUrl(expectedTarget) &&
      evidence.browser.targetUrl === expectedTarget,
    "performance-evidence-release-target-url-invalid",
  );
}

function verifyGitCommitSourceBindings(
  gitCommit: string,
  bindings: Readonly<Record<string, string>>,
): void {
  invariant(isGitCommit(gitCommit), "performance-evidence-git-commit-invalid");
  for (const relativePath of releaseSourcePaths) {
    let blob: Buffer | null = null;
    try {
      blob = execFileSync("git", ["show", `${gitCommit}:${relativePath}`], {
        cwd: root,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      blob = null;
    }
    invariant(
      blob !== null,
      `performance-evidence-git-source-missing:${relativePath}`,
    );
    invariant(
      createHash("sha256").update(blob).digest("hex") === bindings[relativePath],
      `performance-evidence-git-source-binding-invalid:${relativePath}`,
    );
  }
}

function sha256(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(join(root, relativePath)))
    .digest("hex");
}

function exactSet(actual: readonly string[], expected: readonly string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value, index) => value === right[index])
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isTrustedReleaseTargetUrl(value: unknown): value is string {
  if (!isHttpUrl(value)) return false;
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  return (
    url.protocol === "https:" &&
    value === url.origin &&
    url.username === "" &&
    url.password === "" &&
    isIP(hostname) === 0 &&
    hostname !== "localhost" &&
    !hostname.endsWith(".localhost") &&
    !hostname.endsWith(".local")
  );
}

function isGitCommit(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAttestedHardwareEnvironment(environment: DeviceEnvironment): boolean {
  const identity = `${environment.gpuVendor} ${environment.renderer}`;
  return (
    environment.physicalDevice === true &&
    environment.emulator === false &&
    isNonEmptyString(environment.deviceModel) &&
    isNonEmptyString(environment.osVersion) &&
    isNonEmptyString(environment.browserVersion) &&
    /^\d+x\d+$/.test(environment.viewport) &&
    isNonEmptyString(environment.inputMethod) &&
    isNonEmptyString(environment.gpuVendor) &&
    isNonEmptyString(environment.renderer) &&
    !softwareRendererPattern.test(identity) &&
    hardwareRendererPattern.test(identity)
  );
}

function readArtifactBinding<T>(
  binding: ArtifactBinding,
  artifactId: string,
  directory = "device-evidence",
): T {
  let artifactPathValid = false;
  try {
    const allowedRoot = realpathSync(
      join(root, "resources/formula-library/v1", directory),
    );
    const candidate = join(root, binding.path);
    const candidateRealPath = realpathSync(candidate);
    artifactPathValid =
      lstatSync(candidate).isFile() &&
      candidateRealPath.startsWith(`${allowedRoot}/`);
  } catch {
    artifactPathValid = false;
  }
  invariant(
    binding.path.startsWith(`resources/formula-library/v1/${directory}/`) &&
      !binding.path.includes("..") &&
      artifactPathValid &&
      /^[a-f0-9]{64}$/.test(binding.sha256) &&
      sha256(binding.path) === binding.sha256,
    `performance-evidence-artifact-binding-invalid:${artifactId}`,
  );
  return readJson<T>(binding.path);
}

function verifyArtifactSourceBindings(
  artifactBindings: Readonly<Record<string, string>>,
  evidenceBindings: Readonly<Record<string, string>>,
  artifactId: string,
): void {
  invariant(
    exactSet(Object.keys(artifactBindings), releaseSourcePaths) &&
      releaseSourcePaths.every(
        (relativePath) =>
          artifactBindings[relativePath] === evidenceBindings[relativePath] &&
          artifactBindings[relativePath] === sha256(relativePath),
      ),
    `performance-evidence-artifact-source-binding-invalid:${artifactId}`,
  );
}

function verifyRollbackArtifactBinding(
  binding: ArtifactBinding,
  scenarioId: RollbackScenarioId,
  evidenceBindings: Readonly<Record<string, string>>,
): RollbackScenarioArtifact {
  const artifact = readArtifactBinding<RollbackScenarioArtifact>(
    binding,
    scenarioId,
    "rollback-evidence",
  );
  verifyArtifactSourceBindings(artifact.sourceBindings, evidenceBindings, scenarioId);
  invariant(
    artifact.schema === "fractalpark-standard-library-rollback-run/v1" &&
      artifact.scenarioId === scenarioId &&
      isNonEmptyString(artifact.command) &&
      artifact.result.status === "pass" &&
      artifact.result.exitCode === 0 &&
      artifact.result.testFiles.length > 0 &&
      artifact.result.testFiles.every(isNonEmptyString) &&
      Number.isInteger(artifact.result.tests) &&
      artifact.result.tests > 0,
    `performance-evidence-rollback-artifact-invalid:${scenarioId}`,
  );
  return artifact;
}

function verifyPerformanceSamples(
  metrics: NonNullable<DeviceRunArtifact["metrics"]>,
  config: PerformanceGateConfig,
  mobile: boolean,
  evidenceId: string,
): void {
  const contract = config.measurementContract;
  verifySamples(metrics.facetPaintSamples, contract.facetPaintSamples, `${evidenceId}:facet`);
  verifySamples(
    metrics.selectedLoadingSamples,
    contract.selectedLoadingSamples,
    `${evidenceId}:selected-loading`,
  );
  verifySamples(
    metrics.coldSelectionSamples,
    contract.coldSelectionSamples,
    `${evidenceId}:cold`,
  );
  verifySamples(
    metrics.hotSelectionSamples,
    contract.hotSelectionSamples,
    `${evidenceId}:hot`,
  );
  const budgets = config.budgets.browser;
  invariant(
    p75(metrics.facetPaintSamples) <= budgets.facetPaintP75Ms &&
      Math.max(...metrics.selectedLoadingSamples) <= budgets.selectedLoadingMaxMs &&
      p95(metrics.hotSelectionSamples) <=
        budgets.hotSelectionToCorrectFrameP95Ms &&
      p95(metrics.coldSelectionSamples) <=
        (mobile
          ? budgets.coldSelectionToCorrectFrameMobileP95Ms
          : budgets.coldSelectionToCorrectFrameDesktopP95Ms) &&
      Number.isInteger(metrics.initialFormulaAssetRequests) &&
      metrics.initialFormulaAssetRequests === budgets.initialFormulaAssetRequests &&
      Number.isInteger(metrics.hotFormulaAssetRequests) &&
      metrics.hotFormulaAssetRequests === budgets.hotFormulaAssetRequests,
    `performance-evidence-device-budget-exceeded:${evidenceId}`,
  );
}

function verifyDeviceArtifactBinding(
  binding: ArtifactBinding,
  deviceId: string,
  environment: DeviceEnvironment,
  gitCommit: string,
  targetUrl: string,
  evidenceBindings: Readonly<Record<string, string>>,
  config: PerformanceGateConfig,
): void {
  const artifact = readArtifactBinding<DeviceRunArtifact>(binding, deviceId);
  verifyArtifactSourceBindings(artifact.sourceBindings, evidenceBindings, deviceId);
  const expectedEnvironment = {
    deviceModel: environment.deviceModel,
    osVersion: environment.osVersion,
    browserVersion: environment.browserVersion,
    viewport: environment.viewport,
    inputMethod: environment.inputMethod,
    gpuVendor: environment.gpuVendor,
    renderer: environment.renderer,
    physicalDevice: environment.physicalDevice,
    emulator: environment.emulator,
  };
  const screenReader = deviceId === "screen-reader-keyboard";
  invariant(
    artifact.schema === "fractalpark-standard-library-device-run/v1" &&
      artifact.deviceId === deviceId &&
      isGitCommit(gitCommit) &&
      isHttpUrl(targetUrl) &&
      artifact.gitCommit === gitCommit &&
      artifact.targetUrl === targetUrl &&
      artifact.kind === (screenReader ? "screen-reader" : "performance") &&
      artifact.tasks.length > 0 &&
      artifact.tasks.every(
        (task) =>
          isNonEmptyString(task.name) &&
          isFiniteNonNegative(task.durationMs) &&
          task.status === "pass",
      ) &&
      JSON.stringify(artifact.environment) === JSON.stringify(expectedEnvironment),
    `performance-evidence-device-artifact-invalid:${deviceId}`,
  );
  if (screenReader) {
    invariant(
      isNonEmptyString(environment.deviceModel) &&
        isNonEmptyString(environment.osVersion) &&
        isNonEmptyString(environment.browserVersion) &&
        isNonEmptyString(environment.viewport) &&
        exactSet(
          artifact.tasks.map((task) => task.name),
          config.accessibilityContract.requiredScreenReaderTasks,
        ),
      `performance-evidence-screen-reader-tasks-incomplete:${deviceId}`,
    );
    return;
  }
  const requiredPerformanceTasks =
    environment.inputMethod === "touch"
      ? config.deviceTaskContract.touchPerformanceTasks
      : config.deviceTaskContract.desktopPerformanceTasks;
  invariant(
    exactSet(
      artifact.tasks.map((task) => task.name),
      requiredPerformanceTasks,
    ),
    `performance-evidence-device-tasks-incomplete:${deviceId}`,
  );
  invariant(
    artifact.metrics !== undefined &&
      artifact.cacheMode ===
        `cold=${config.measurementContract.coldCacheMode};hot=${config.measurementContract.hotCacheMode}`,
    `performance-evidence-device-metrics-missing:${deviceId}`,
  );
  verifyPerformanceSamples(
    artifact.metrics,
    config,
    environment.inputMethod === "touch",
    deviceId,
  );
}

function verifyBrowserArtifactBinding(
  binding: ArtifactBinding,
  environment: ReleaseEvidence["browser"]["environment"],
  browserEvidence: ReleaseEvidence["browser"],
  evidenceBindings: Readonly<Record<string, string>>,
): void {
  const artifact = readArtifactBinding<BrowserMeasurementArtifact>(
    binding,
    "desktop-chromium-reference",
  );
  verifyArtifactSourceBindings(
    artifact.sourceBindings,
    evidenceBindings,
    "desktop-chromium-reference",
  );
  invariant(
    artifact.schema === "fractalpark-standard-library-browser-measurement/v1" &&
      artifact.releaseQualifying === true &&
      isGitCommit(browserEvidence.gitCommit) &&
      isHttpUrl(browserEvidence.targetUrl) &&
      artifact.gitCommit === browserEvidence.gitCommit &&
      artifact.targetUrl === browserEvidence.targetUrl &&
      artifact.environment.browser === environment.browser &&
      artifact.environment.browserVersion === environment.browserVersion &&
      artifact.environment.deviceModel === environment.deviceModel &&
      artifact.environment.osVersion === environment.osVersion &&
      artifact.environment.viewport === environment.viewport &&
      artifact.environment.inputMethod === environment.inputMethod &&
      artifact.environment.cacheMode === environment.cacheMode &&
      artifact.environment.webgl.vendor === environment.gpuVendor &&
      artifact.environment.webgl.renderer === environment.renderer &&
      artifact.environment.physicalDevice === environment.physicalDevice &&
      artifact.environment.emulator === environment.emulator &&
      JSON.stringify(artifact.samples) ===
        JSON.stringify({
          coldSelectionSamples: browserEvidence.coldSelectionSamples,
          hotSelectionSamples: browserEvidence.hotSelectionSamples,
          facetPaintSamples: browserEvidence.facetPaintSamples,
          selectedLoadingSamples: browserEvidence.selectedLoadingSamples,
          libraryOpenSamples: browserEvidence.libraryOpenSamples,
          libraryHeapDeltaSamples: browserEvidence.libraryHeapDeltaSamples,
          previewDecodeSamples: browserEvidence.previewDecodeSamples,
          libraryDialogDescendants: browserEvidence.libraryDialogDescendants,
          publishedIndexTransferBytes: browserEvidence.publishedIndexTransferBytes,
          initialFormulaAssetRequests: browserEvidence.initialFormulaAssetRequests,
          hotFormulaAssetRequests: browserEvidence.hotFormulaAssetRequests,
        }),
    "performance-evidence-browser-artifact-invalid",
  );
}

function verifySamples(
  samples: readonly number[],
  exactCount: number,
  name: string,
): void {
  invariant(
    Array.isArray(samples) &&
      samples.length === exactCount &&
      samples.every(isFiniteNonNegative),
    `performance-evidence-samples-invalid:${name}`,
  );
}

function percentile(samples: readonly number[], value: number): number {
  invariant(
    samples.length > 0 && samples.every(isFiniteNonNegative),
    "performance-evidence-samples-invalid:percentile",
  );
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * value) - 1];
}

const p75 = (samples: readonly number[]) => percentile(samples, 0.75);
const p95 = (samples: readonly number[]) => percentile(samples, 0.95);

function verifyStaticAssets(config: PerformanceGateConfig): JsonRecord {
  invariant(
    config.schema === "fractalpark-standard-library-performance-gates/v1",
    "performance-gates-schema-invalid",
  );
  invariant(
    config.measurementContract.libraryOpenSamples === 20 &&
      config.measurementContract.libraryHeapDeltaSamples === 20 &&
      config.measurementContract.previewDecodeSamples === 20 &&
      config.measurementContract.coldSelectionSamples === 20 &&
      config.measurementContract.hotSelectionSamples === 30 &&
      config.measurementContract.facetPaintSamples === 50 &&
      config.measurementContract.selectedLoadingSamples === 50 &&
      config.measurementContract.facetPercentile === 75 &&
      config.measurementContract.framePercentile === 95 &&
      exactSet(
        config.measurementContract.responsiveWidths.map(String),
        ["320", "390"],
      ) &&
      config.measurementContract.coldCacheMode ===
        "isolated-browser-context-per-sample" &&
      config.measurementContract.hotCacheMode ===
        "preloaded-definition-and-compiled-program" &&
      config.measurementContract.requiredTuple.join(",") ===
        "gitCommit,targetUrl,sourceBindings,environment,samples",
    "performance-gates-measurement-contract-invalid",
  );
  invariant(
    config.budgets.browser.facetPaintP75Ms === 100 &&
      config.budgets.browser.selectedLoadingMaxMs === 100 &&
      config.budgets.browser.hotSelectionToCorrectFrameP95Ms === 300 &&
      config.budgets.browser.coldSelectionToCorrectFrameDesktopP95Ms === 2000 &&
      config.budgets.browser.coldSelectionToCorrectFrameMobileP95Ms === 3000 &&
      config.budgets.browser.initialFormulaAssetRequests === 0 &&
      config.budgets.browser.hotFormulaAssetRequests === 0,
    "performance-gates-approved-browser-budget-drift",
  );
  invariant(
    config.budgets.staticAssets.nativeDefinitionOverlapCount === 68 &&
      config.budgets.staticAssets.nativeDefinitionOverlapSha256 ===
        "4f6e82e6d879022665fb7b1c72c8040e4eb902508c76b9d862d713ea8ea7128b",
    "performance-gates-native-overlap-contract-drift",
  );
  invariant(
    exactSet(config.releaseDevices, [
      "desktop-chromium-real-gpu",
      "desktop-firefox-real-gpu",
      "iphone-safari-touch",
      "ipad-safari-touch",
      "android-chrome-touch",
      "screen-reader-keyboard",
    ]),
    "performance-gates-device-contract-invalid",
  );
  invariant(
    exactSet(config.rollbackContract.requiredDeployedSteps, [
      "backup-current",
      "disable-writer",
      "disable-feature",
      "activate-lkg-runtime",
      "verify-reader-floor",
      "verify-alias-resolver",
      "restore-current",
    ]),
    "performance-gates-rollback-contract-invalid",
  );
  invariant(
    exactSet(config.accessibilityContract.requiredScreenReaderTasks, [
      "open-close-focus",
      "loading-announcement",
      "selection-busy",
      "failure-alert-lkg",
      "keyboard-pagination-facets",
    ]),
    "performance-gates-accessibility-contract-invalid",
  );
  invariant(
    exactSet(config.deviceTaskContract.desktopPerformanceTasks, [
      "library-walking-skeleton",
      "responsive-320",
      "responsive-390",
      "gpu-recovery",
    ]) &&
      exactSet(config.deviceTaskContract.touchPerformanceTasks, [
        "library-walking-skeleton",
        "touch-facet-selection",
        "gpu-recovery",
      ]),
    "performance-gates-device-task-contract-invalid",
  );
  invariant(
    config.counts.initialLibraryRows === PUBLISHED_FORMULA_LIBRARY_PAGE_SIZE,
    "performance-gates-initial-row-budget-drift",
  );

  const decisions = readJson<PublicationDecisions>(paths.decisions);
  const index = readJson<PublishedFormulaRuntimeIndexV1>(paths.index);
  const manifest = readJson<{ readonly rowCount: number }>(paths.manifest);
  const previews = readJson<PreviewManifest>(paths.previewManifest);
  invariant(
    decisions.decisionRevision === config.decisionRevision &&
      decisions.contentHash === config.publicationDecisionsContentHash &&
      decisions.formulaCount === config.counts.decisions &&
      decisions.rows.length === config.counts.decisions &&
      decisions.decisionCounts.publish === config.counts.published &&
      decisions.decisionCounts.hold === config.counts.held &&
      decisions.decisionCounts.exclude === config.counts.excluded,
    "performance-gates-decision-binding-invalid",
  );
  invariant(
    index.decisionRevision === config.decisionRevision &&
      index.publicationDecisionsContentHash ===
        config.publicationDecisionsContentHash &&
      index.rowCount === config.counts.published &&
      index.rows.length === config.counts.published &&
      manifest.rowCount === config.counts.published,
    "performance-gates-runtime-binding-invalid",
  );
  invariant(
    previews.decisionRevision === config.decisionRevision &&
      previews.publicationDecisionsContentHash ===
        config.publicationDecisionsContentHash &&
      previews.rowCount === config.counts.published &&
      previews.rows.length === config.counts.published,
    "performance-gates-preview-binding-invalid",
  );
  const publishedIds = decisions.rows
    .filter((row) => row.publicationDecision === "publish")
    .map((row) => row.formulaId);
  invariant(
    exactSet(
      index.rows.map((row) => row.formulaId),
      publishedIds,
    ) &&
      exactSet(
        previews.rows.map((row) => row.formulaId),
        publishedIds,
      ),
    "performance-gates-published-set-invalid",
  );

  const definitionNames = readdirSync(join(root, paths.definitions)).filter((name) =>
    name.endsWith(".frm"),
  );
  const expectedDefinitionNames = index.rows.map(
    (row) => `${row.sourceRevision}.frm`,
  );
  invariant(
    exactSet(definitionNames, expectedDefinitionNames) &&
      index.rows.every(
        (row) =>
          row.definitionPath === `definitions/${row.sourceRevision}.frm` &&
          sha256(`${paths.definitions}/${row.sourceRevision}.frm`) ===
            row.sourceRevision,
      ),
    "performance-gates-definition-content-address-invalid",
  );
  const definitionSizes = directorySizes(paths.definitions, ".frm");
  const previewSizes = directorySizes(paths.previews, ".png");
  invariant(
    definitionSizes.length === config.counts.published &&
      previewSizes.length === config.counts.published,
    "performance-gates-artifact-count-invalid",
  );
  const metrics = {
    publishedIndexBytes: fileBytes(paths.index),
    publishedManifestBytes: fileBytes(paths.manifest),
    definitionsTotalBytes: definitionSizes.reduce((sum, value) => sum + value, 0),
    definitionMaxBytes: Math.max(...definitionSizes),
    previewManifestBytes: fileBytes(paths.previewManifest),
    previewsTotalBytes: previewSizes.reduce((sum, value) => sum + value, 0),
    previewMaxBytes: Math.max(...previewSizes),
  };
  for (const [name, value] of Object.entries(metrics)) {
    const budget = config.budgets.staticAssets[name as keyof typeof metrics];
    invariant(value <= budget, `performance-gates-static-budget-exceeded:${name}`);
  }
  return metrics;
}

function verifyBuildOutput(config: PerformanceGateConfig): JsonRecord {
  invariant(
    existsSync(join(root, ".next/BUILD_ID")) &&
      readFileSync(join(root, ".next/BUILD_ID"), "utf8").trim().length > 0,
    "performance-gates-build-output-missing",
  );
  const outputFiles = [
    ...recursiveFiles(".next/server"),
    ...recursiveFiles(".next/static"),
  ];
  const bundledFrmFiles = outputFiles.filter((file) => file.endsWith(".frm"));
  const textFiles = outputFiles.filter((file) =>
    /\.(?:js|json|html|rsc)$/.test(file),
  );
  const definitions = readdirSync(join(root, paths.definitions))
    .filter((name) => name.endsWith(".frm"))
    .map((name) => ({
      name,
      body: readFileSync(join(root, paths.definitions, name), "utf8"),
    }));
  const nativeRecipeSource = releaseSourcePaths
    .filter((file) => /\/native-recipes(?:-b94-[a-z]+)?\.ts$/.test(file))
    .map((file) => readFileSync(join(root, file), "utf8"))
    .join("\n");
  const nativeDefinitionMatches = new Set<string>();
  const publishedOnlyDefinitionMatches = new Set<string>();
  let auditedBytes = 0;
  for (const file of textFiles) {
    const content = readFileSync(join(root, file), "utf8");
    auditedBytes += Buffer.byteLength(content);
    for (const definition of definitions) {
      const escaped = JSON.stringify(definition.body).slice(1, -1);
      if (!content.includes(definition.body) && !content.includes(escaped)) {
        continue;
      }
      if (
        nativeRecipeSource.includes(definition.body) ||
        nativeRecipeSource.includes(escaped)
      ) {
        nativeDefinitionMatches.add(definition.name);
      } else {
        publishedOnlyDefinitionMatches.add(definition.name);
      }
    }
  }
  const nativeDefinitionOverlapSha256 = createHash("sha256")
    .update(`${[...nativeDefinitionMatches].sort().join("\n")}\n`)
    .digest("hex");
  invariant(
    textFiles.length > 0 &&
      bundledFrmFiles.length === 0 &&
      nativeDefinitionMatches.size ===
        config.budgets.staticAssets.nativeDefinitionOverlapCount &&
      nativeDefinitionOverlapSha256 ===
        config.budgets.staticAssets.nativeDefinitionOverlapSha256 &&
      publishedOnlyDefinitionMatches.size === 0,
    "performance-gates-build-eager-definition-detected",
  );
  return {
    textFiles: textFiles.length,
    auditedBytes,
    bundledFrmFiles: bundledFrmFiles.length,
    nativeDefinitionMatches: nativeDefinitionMatches.size,
    nativeDefinitionOverlapSha256,
    publishedOnlyDefinitionMatches: publishedOnlyDefinitionMatches.size,
  };
}

function verifyEvidenceFreshness(config: PerformanceGateConfig): ReleaseEvidence {
  const evidence = readJson<ReleaseEvidence>(paths.evidence);
  invariant(
    evidence.schema === "fractalpark-standard-library-performance-evidence/v1",
    "performance-evidence-schema-invalid",
  );
  for (const relativePath of releaseSourcePaths) {
    invariant(
      evidence.sourceBindings[relativePath] === sha256(relativePath),
      `performance-evidence-source-binding-invalid:${relativePath}`,
    );
  }
  invariant(
    exactSet(
      evidence.devices.map((row) => row.id),
      config.releaseDevices,
    ),
    "performance-evidence-device-matrix-invalid",
  );
  const buildBudgets = config.budgets.build;
  invariant(
    isFiniteNonNegative(evidence.build.wallMs) &&
      evidence.build.wallMs > 0 &&
      evidence.build.wallMs <= buildBudgets.wallMs &&
      isFiniteNonNegative(evidence.build.maxRssBytes) &&
      evidence.build.maxRssBytes > 0 &&
      evidence.build.maxRssBytes <= buildBudgets.maxRssBytes &&
      Number.isInteger(evidence.build.generatedPages) &&
      evidence.build.generatedPages === buildBudgets.generatedPages,
    "performance-gates-build-budget-exceeded",
  );
  for (const scenarioId of localRollbackScenarioIds) {
    const scenario = evidence.rollbackDrill[scenarioId];
    invariant(
      scenario?.status === "pass",
      `performance-evidence-rollback-incomplete:${scenarioId}`,
    );
    verifyRollbackArtifactBinding(
      scenario.artifact,
      scenarioId,
      evidence.sourceBindings,
    );
  }
  invariant(
    ["pass", "fail", "pending"].includes(
      evidence.rollbackDrill.deployedPreview.status,
    ),
    "performance-evidence-deployed-rollback-status-invalid",
  );
  if (evidence.rollbackDrill.deployedPreview.status === "pass") {
    verifyRollbackArtifactBinding(
      evidence.rollbackDrill.deployedPreview.artifact,
      "deployedPreview",
      evidence.sourceBindings,
    );
  }
  return evidence;
}

function verifyReleaseEvidence(
  config: PerformanceGateConfig,
  evidence: ReleaseEvidence,
): JsonRecord {
  invariant(
    evidence.rollbackDrill.deployedPreview.status === "pass",
    "performance-evidence-deployed-rollback-incomplete",
  );
  const deployedRollbackArtifact = verifyRollbackArtifactBinding(
    evidence.rollbackDrill.deployedPreview.artifact,
    "deployedPreview",
    evidence.sourceBindings,
  );
  invariant(
    deployedRollbackArtifact.gitCommit === evidence.browser.gitCommit &&
      deployedRollbackArtifact.targetUrl === evidence.browser.targetUrl &&
      deployedRollbackArtifact.result.steps !== undefined &&
      exactSet(
        deployedRollbackArtifact.result.steps.map((step) => step.name),
        config.rollbackContract.requiredDeployedSteps,
      ) &&
      deployedRollbackArtifact.result.steps.every(
        (step) => step.status === "pass",
      ),
    "performance-evidence-deployed-rollback-target-invalid",
  );
  verifyTrustedReleaseCandidate(evidence);
  verifyGitCommitSourceBindings(
    evidence.browser.gitCommit,
    evidence.sourceBindings,
  );
  const referenceEnvironment = evidence.browser.environment;
  invariant(
    isAttestedHardwareEnvironment(referenceEnvironment) &&
      referenceEnvironment.browser === "chromium" &&
      referenceEnvironment.inputMethod === "mouse-keyboard" &&
      referenceEnvironment.cacheMode ===
        `cold=${config.measurementContract.coldCacheMode};hot=${config.measurementContract.hotCacheMode}`,
    "performance-evidence-real-gpu-required",
  );
  verifyBrowserArtifactBinding(
    referenceEnvironment.artifact,
    referenceEnvironment,
    evidence.browser,
    evidence.sourceBindings,
  );
  const contract = config.measurementContract;
  verifySamples(
    evidence.browser.libraryOpenSamples,
    contract.libraryOpenSamples,
    "library-open",
  );
  verifySamples(
    evidence.browser.libraryHeapDeltaSamples,
    contract.libraryHeapDeltaSamples,
    "library-heap-delta",
  );
  verifySamples(
    evidence.browser.previewDecodeSamples,
    contract.previewDecodeSamples,
    "preview-decode",
  );
  verifySamples(
    evidence.browser.coldSelectionSamples,
    contract.coldSelectionSamples,
    "cold-selection",
  );
  verifySamples(
    evidence.browser.hotSelectionSamples,
    contract.hotSelectionSamples,
    "hot-selection",
  );
  verifySamples(
    evidence.browser.facetPaintSamples,
    contract.facetPaintSamples,
    "facet-paint",
  );
  verifySamples(
    evidence.browser.selectedLoadingSamples,
    contract.selectedLoadingSamples,
    "selected-loading",
  );
  invariant(
    Number.isInteger(evidence.browser.libraryDialogDescendants) &&
      isFiniteNonNegative(evidence.browser.libraryDialogDescendants) &&
      Number.isInteger(evidence.browser.publishedIndexTransferBytes) &&
      isFiniteNonNegative(evidence.browser.publishedIndexTransferBytes) &&
      Number.isInteger(evidence.browser.initialFormulaAssetRequests) &&
      isFiniteNonNegative(evidence.browser.initialFormulaAssetRequests) &&
      Number.isInteger(evidence.browser.hotFormulaAssetRequests) &&
      isFiniteNonNegative(evidence.browser.hotFormulaAssetRequests),
    "performance-evidence-browser-scalars-invalid",
  );
  const performanceMetrics = {
    facetPaintSamples: evidence.browser.facetPaintSamples,
    selectedLoadingSamples: evidence.browser.selectedLoadingSamples,
    coldSelectionSamples: evidence.browser.coldSelectionSamples,
    hotSelectionSamples: evidence.browser.hotSelectionSamples,
    initialFormulaAssetRequests: evidence.browser.initialFormulaAssetRequests,
    hotFormulaAssetRequests: evidence.browser.hotFormulaAssetRequests,
  };
  verifyPerformanceSamples(
    performanceMetrics,
    config,
    false,
    "desktop-chromium-reference",
  );
  const browserMetrics = {
    libraryOpenP95Ms: p95(evidence.browser.libraryOpenSamples),
    libraryDialogDescendants: evidence.browser.libraryDialogDescendants,
    libraryHeapDeltaP95Bytes: p95(evidence.browser.libraryHeapDeltaSamples),
    publishedIndexTransferBytes: evidence.browser.publishedIndexTransferBytes,
    facetPaintP75Ms: p75(evidence.browser.facetPaintSamples),
    selectedLoadingMaxMs: Math.max(...evidence.browser.selectedLoadingSamples),
    previewDecodeP95Ms: p95(evidence.browser.previewDecodeSamples),
    initialFormulaAssetRequests: evidence.browser.initialFormulaAssetRequests,
    hotFormulaAssetRequests: evidence.browser.hotFormulaAssetRequests,
    coldSelectionToCorrectFrameDesktopP95Ms: p95(
      evidence.browser.coldSelectionSamples,
    ),
    hotSelectionToCorrectFrameP95Ms: p95(evidence.browser.hotSelectionSamples),
  };
  const budgets = config.budgets.browser;
  invariant(
    browserMetrics.libraryOpenP95Ms <= budgets.libraryOpenP95Ms &&
      browserMetrics.libraryDialogDescendants <= budgets.libraryDialogDescendants &&
      browserMetrics.libraryHeapDeltaP95Bytes <= budgets.libraryHeapDeltaP95Bytes &&
      browserMetrics.publishedIndexTransferBytes <= budgets.publishedIndexTransferBytes &&
      browserMetrics.previewDecodeP95Ms <= budgets.previewDecodeP95Ms,
    "performance-gates-browser-budget-exceeded",
  );
  const screenReaderDevice = evidence.devices.find(
    (row) => row.id === "screen-reader-keyboard",
  );
  invariant(
    evidence.accessibility.status === "pass" &&
      screenReaderDevice?.status === "pass" &&
      JSON.stringify(evidence.accessibility.artifact) ===
        JSON.stringify(screenReaderDevice.environment.artifact),
    "performance-evidence-accessibility-incomplete",
  );
  const expectedInputMethod: Readonly<Record<string, string>> = {
    "desktop-chromium-real-gpu": "mouse-keyboard",
    "desktop-firefox-real-gpu": "mouse-keyboard",
    "iphone-safari-touch": "touch",
    "ipad-safari-touch": "touch",
    "android-chrome-touch": "touch",
    "screen-reader-keyboard": "screen-reader-keyboard",
  };
  for (const requiredId of config.releaseDevices) {
    const device = evidence.devices.find((row) => row.id === requiredId);
    const environmentAttested =
      requiredId === "screen-reader-keyboard"
        ? device?.environment.physicalDevice === true &&
          device.environment.emulator === false
        : device !== undefined && isAttestedHardwareEnvironment(device.environment);
    invariant(
      device?.status === "pass" &&
        device.gitCommit === evidence.browser.gitCommit &&
        device.targetUrl === evidence.browser.targetUrl &&
        environmentAttested &&
        device.environment.inputMethod === expectedInputMethod[requiredId],
      `performance-evidence-device-incomplete:${requiredId}`,
    );
    verifyDeviceArtifactBinding(
      device.environment.artifact,
      requiredId,
      device.environment,
      device.gitCommit,
      device.targetUrl,
      evidence.sourceBindings,
      config,
    );
  }
  return { browserMetrics, devices: evidence.devices.length };
}

function main(): void {
  const config = readJson<PerformanceGateConfig>(paths.config);
  const staticAssets = verifyStaticAssets(config);
  const buildOutput = process.argv.includes("--build-output")
    ? verifyBuildOutput(config)
    : undefined;
  const evidence = verifyEvidenceFreshness(config);
  const release = process.argv.includes("--release")
    ? verifyReleaseEvidence(config, evidence)
    : undefined;
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      staticAssets,
      buildOutput,
      evidence: {
        build: evidence.build,
        pendingDevices: evidence.devices.filter((row) => row.status !== "pass").length,
        attestedHardware: isAttestedHardwareEnvironment(
          evidence.browser.environment,
        ),
      },
      release,
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
          : "standard-library-performance-verification-failed",
    })}\n`,
  );
  process.exitCode = 1;
}
