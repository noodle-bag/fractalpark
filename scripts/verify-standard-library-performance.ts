import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
    readonly percentile: number;
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
    };
    readonly browser: Record<string, number>;
    readonly build: Record<string, number>;
  };
  readonly releaseDevices: readonly string[];
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
    readonly environment: {
      readonly browser: string;
    } & DeviceEnvironment;
    readonly coldSelectionSamples: readonly number[];
    readonly hotSelectionSamples: readonly number[];
    readonly facetPaintSamples: readonly number[];
    readonly libraryOpenSamples: readonly number[];
    readonly libraryHeapDeltaSamples: readonly number[];
    readonly previewDecodeSamples: readonly number[];
    readonly libraryDialogDescendants: number;
    readonly publishedIndexTransferBytes: number;
  };
  readonly build: {
    readonly wallMs: number;
    readonly maxRssBytes: number;
    readonly generatedPages: number;
  };
  readonly devices: readonly {
    readonly id: string;
    readonly status: "pass" | "fail" | "pending";
    readonly environment: DeviceEnvironment;
  }[];
  readonly accessibility: {
    readonly status: "pass" | "fail" | "pending";
    readonly evidence: string;
  };
  readonly rollbackDrill: {
    readonly indexFailure: RollbackScenarioEvidence;
    readonly definitionFailure: RollbackScenarioEvidence;
    readonly supersession: RollbackScenarioEvidence;
    readonly hostileUrl: RollbackScenarioEvidence;
    readonly readerFeatureRollback: RollbackScenarioEvidence;
  };
}

interface RollbackScenarioEvidence {
  readonly status: "pass" | "fail" | "pending";
  readonly artifact: ArtifactBinding;
}

interface RollbackScenarioArtifact {
  readonly schema: "fractalpark-standard-library-rollback-run/v1";
  readonly scenarioId: (typeof rollbackScenarioIds)[number];
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly command: string;
  readonly result: {
    readonly status: "pass" | "fail";
    readonly exitCode: number;
    readonly testFiles: readonly string[];
    readonly tests: number;
  };
}

interface DeviceRunArtifact {
  readonly schema: "fractalpark-standard-library-device-run/v1";
  readonly deviceId: string;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly environment: Omit<DeviceEnvironment, "artifact">;
  readonly samples: readonly {
    readonly name: string;
    readonly durationMs: number;
    readonly status: "pass" | "fail";
  }[];
}

interface BrowserMeasurementArtifact {
  readonly schema: "fractalpark-standard-library-browser-measurement/v1";
  readonly releaseQualifying: boolean;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly environment: {
    readonly browser: string;
    readonly deviceModel: string;
    readonly osVersion: string;
    readonly viewport: string;
    readonly inputMethod: string;
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
  "src/components/fractal/FractalCanvas.tsx",
  "src/components/fractal/PublishedFormulaLibrary.tsx",
  "src/components/gallery/PresetThumbnail.tsx",
  "src/hooks/useFractalRenderer.ts",
  "src/lib/published-formula-library.ts",
  "src/lib/published-formula-selection.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/fractals/renderer.ts",
  "src/test/document-v3-envelope-v2.test.ts",
  "src/test/published-formula-library.test.tsx",
  "src/test/published-formula-runtime.test.ts",
  "src/test/published-formula-selection.test.ts",
  "src/test/fractal-renderer-race.test.ts",
  "scripts/measure-standard-library-performance.ts",
  "scripts/verify-standard-library-performance.ts",
  "tests/e2e/formula-switch.spec.ts",
  "package.json",
  "package-lock.json",
] as const;

const rollbackScenarioIds = [
  "indexFailure",
  "definitionFailure",
  "supersession",
  "hostileUrl",
  "readerFeatureRollback",
] as const;

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
  invariant(
    binding.path.startsWith(`resources/formula-library/v1/${directory}/`) &&
      !binding.path.includes("..") &&
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
  scenarioId: (typeof rollbackScenarioIds)[number],
  evidenceBindings: Readonly<Record<string, string>>,
): void {
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
}

function verifyDeviceArtifactBinding(
  binding: ArtifactBinding,
  deviceId: string,
  environment: DeviceEnvironment,
  evidenceBindings: Readonly<Record<string, string>>,
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
  invariant(
    artifact.schema === "fractalpark-standard-library-device-run/v1" &&
      artifact.deviceId === deviceId &&
      artifact.samples.length >= 3 &&
      artifact.samples.every(
        (sample) =>
          isNonEmptyString(sample.name) &&
          isFiniteNonNegative(sample.durationMs) &&
          sample.status === "pass",
      ) &&
      JSON.stringify(artifact.environment) === JSON.stringify(expectedEnvironment),
    `performance-evidence-device-artifact-invalid:${deviceId}`,
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
      artifact.environment.browser === environment.browser &&
      artifact.environment.deviceModel === environment.deviceModel &&
      artifact.environment.osVersion === environment.osVersion &&
      artifact.environment.viewport === environment.viewport &&
      artifact.environment.inputMethod === environment.inputMethod &&
      artifact.environment.webgl.vendor === environment.gpuVendor &&
      artifact.environment.webgl.renderer === environment.renderer &&
      artifact.environment.physicalDevice === environment.physicalDevice &&
      artifact.environment.emulator === environment.emulator &&
      JSON.stringify(artifact.samples) ===
        JSON.stringify({
          coldSelectionSamples: browserEvidence.coldSelectionSamples,
          hotSelectionSamples: browserEvidence.hotSelectionSamples,
          facetPaintSamples: browserEvidence.facetPaintSamples,
          libraryOpenSamples: browserEvidence.libraryOpenSamples,
          libraryHeapDeltaSamples: browserEvidence.libraryHeapDeltaSamples,
          previewDecodeSamples: browserEvidence.previewDecodeSamples,
          libraryDialogDescendants: browserEvidence.libraryDialogDescendants,
          publishedIndexTransferBytes: browserEvidence.publishedIndexTransferBytes,
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

function p95(samples: readonly number[]): number {
  invariant(
    samples.length > 0 && samples.every(isFiniteNonNegative),
    "performance-evidence-samples-invalid:p95",
  );
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function verifyStaticAssets(config: PerformanceGateConfig): JsonRecord {
  invariant(
    config.schema === "fractalpark-standard-library-performance-gates/v1",
    "performance-gates-schema-invalid",
  );
  invariant(
    config.measurementContract.percentile === 95 &&
      config.measurementContract.requiredTuple.join(",") ===
        "sourceBindings,environment,samples",
    "performance-gates-measurement-contract-invalid",
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
    const budget = config.budgets.staticAssets[
      name as keyof typeof config.budgets.staticAssets
    ];
    invariant(value <= budget, `performance-gates-static-budget-exceeded:${name}`);
  }
  return metrics;
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
  for (const scenarioId of rollbackScenarioIds) {
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
  return evidence;
}

function verifyReleaseEvidence(
  config: PerformanceGateConfig,
  evidence: ReleaseEvidence,
): JsonRecord {
  const referenceEnvironment = evidence.browser.environment;
  invariant(
    isAttestedHardwareEnvironment(referenceEnvironment) &&
      /chrom(e|ium)/i.test(referenceEnvironment.browser) &&
      referenceEnvironment.inputMethod === "mouse-keyboard",
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
  invariant(
    Number.isInteger(evidence.browser.libraryDialogDescendants) &&
      isFiniteNonNegative(evidence.browser.libraryDialogDescendants) &&
      Number.isInteger(evidence.browser.publishedIndexTransferBytes) &&
      isFiniteNonNegative(evidence.browser.publishedIndexTransferBytes),
    "performance-evidence-browser-scalars-invalid",
  );
  const browserMetrics = {
    libraryOpenP95Ms: p95(evidence.browser.libraryOpenSamples),
    libraryDialogDescendants: evidence.browser.libraryDialogDescendants,
    libraryHeapDeltaP95Bytes: p95(evidence.browser.libraryHeapDeltaSamples),
    publishedIndexTransferBytes: evidence.browser.publishedIndexTransferBytes,
    facetPaintP95Ms: p95(evidence.browser.facetPaintSamples),
    previewDecodeP95Ms: p95(evidence.browser.previewDecodeSamples),
    coldSelectionToCorrectFrameP95Ms: p95(
      evidence.browser.coldSelectionSamples,
    ),
    hotSelectionToCorrectFrameP95Ms: p95(evidence.browser.hotSelectionSamples),
  };
  for (const [name, value] of Object.entries(browserMetrics)) {
    const budget = config.budgets.browser[name];
    invariant(
      typeof budget === "number" && value <= budget,
      `performance-gates-browser-budget-exceeded:${name}`,
    );
  }
  invariant(
    evidence.accessibility.status === "pass" &&
      evidence.accessibility.evidence.length > 0,
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
    invariant(
      device?.status === "pass" &&
        isAttestedHardwareEnvironment(device.environment) &&
        device.environment.inputMethod === expectedInputMethod[requiredId],
      `performance-evidence-device-incomplete:${requiredId}`,
    );
    verifyDeviceArtifactBinding(
      device.environment.artifact,
      requiredId,
      device.environment,
      evidence.sourceBindings,
    );
  }
  return { browserMetrics, devices: evidence.devices.length };
}

function main(): void {
  const config = readJson<PerformanceGateConfig>(paths.config);
  const staticAssets = verifyStaticAssets(config);
  const evidence = verifyEvidenceFreshness(config);
  const release = process.argv.includes("--release")
    ? verifyReleaseEvidence(config, evidence)
    : undefined;
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      staticAssets,
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
