import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_CLASSIC_REGRESSION_RENDERER_REPORT_SCHEMA_V1 =
  "fractalpark-julia-classic-regression-renderer-report/v1" as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_CLOSURE_SCHEMA_V1 =
  "fractalpark-julia-classic-regression-renderer-evidence/v1" as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_IDS_V1 = Object.freeze([
  "015c5d9d-b9b1-5155-afa7-10a3f48c194a",
  "09cecc65-3da9-543a-a1dd-7963f5e2f830",
  "81701548-4c1a-5038-a7e2-27ee265b0abc",
  "89e6c1c2-5105-50b7-b7e2-e1f03e4fe8e1",
  "9923991c-19b5-5559-8250-5eb04726f4bd",
  "cefe7738-0e8a-547f-ac85-ac3db2529907",
  "f7a06a52-361c-598f-bf99-5e55a0047f1f",
] as const);
export const JULIA_CLASSIC_REGRESSION_RENDERER_STRING_V1 =
  "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_RUNTIME_KEYS_V1 = Object.freeze([
  "@playwright/test",
  "chromium-runtime",
  "playwright",
  "playwright-core",
] as const);
export const JULIA_CLASSIC_REGRESSION_RENDERER_INTEGRATION_WITNESS_ID_V1 =
  JULIA_CLASSIC_REGRESSION_RENDERER_IDS_V1[0];
export const JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1 = 0.005;

const SHA_256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type UnknownRecord = Record<string, unknown>;

export interface JuliaClassicRegressionRendererReportRowV1 {
  readonly formulaId: string;
  readonly candidateContentHash: string;
  readonly evaluatedSourceRevision: string;
  readonly evaluatedSemanticHash: string;
  readonly binding: Readonly<{
    kind: "source-split";
    sourceRevision: string;
  }>;
  readonly bindingRevision: string;
  readonly supportLane: "source-split-direct" | "source-split-transitive";
  readonly profileDigest: string;
  readonly status: "passed";
  readonly reasonCode: null;
  readonly rendererClass: "SwiftShader-software";
  readonly fullFrameworkCompileLink: true;
  readonly fullFrameworkCappedDraw: boolean;
  readonly deterministicDoubleDraw: true;
  readonly traceOrbitSteps: 128;
  readonly traceStateDimensions: 18;
  readonly traceStateComparisons: 2304;
  readonly traceFlagComparisons: 2304;
  readonly imagePixelComparisons: 96;
  readonly observedImageDifferingPixels: number;
  readonly observedMaximumRelativeError: number;
}

export interface JuliaClassicRegressionRendererReportV1 {
  readonly schema: typeof JULIA_CLASSIC_REGRESSION_RENDERER_REPORT_SCHEMA_V1;
  readonly ok: true;
  readonly start: 0;
  readonly rowCount: 7;
  readonly fullAuthorityRowCount: 7;
  readonly fullGate: true;
  readonly chunkSize: 7;
  readonly renderer: typeof JULIA_CLASSIC_REGRESSION_RENDERER_STRING_V1;
  readonly durationMs: number;
  readonly candidateManifestContentHash: string;
  readonly waveId: string;
  readonly preGpuContentHash: string;
  readonly executionSourceBindingsContentHash: string;
  readonly workerBundleSha256: string;
  readonly runtimeDependencyBindings: Readonly<Record<string, string>>;
  readonly idsSha256: string;
  readonly statusCounts: Readonly<{ passed: 7; blocked: 0 }>;
  readonly rows: readonly JuliaClassicRegressionRendererReportRowV1[];
}

export interface JuliaClassicRegressionRendererEvidenceRowV1
  extends JuliaClassicRegressionRendererReportRowV1 {
  readonly minimumImageDifferingPixels: 1;
  readonly relativeTolerance: 0.005;
  readonly receipt: string;
}

export interface JuliaClassicRegressionRendererEvidenceV1 {
  readonly schema: typeof JULIA_CLASSIC_REGRESSION_RENDERER_CLOSURE_SCHEMA_V1;
  readonly revision: 1;
  readonly authority: "evidence-only";
  readonly activationStatus: false;
  readonly correctiveContentHash: string;
  readonly correctiveWholeFileSha256: string;
  readonly privateReportWholeSha256: string;
  readonly privateReportContentHash: string;
  readonly executionSourceBindingsContentHash: string;
  readonly workerBundleSha256: string;
  readonly runtimeDependencyBindings: Readonly<Record<string, string>>;
  readonly renderer: typeof JULIA_CLASSIC_REGRESSION_RENDERER_STRING_V1;
  readonly durationMs: number;
  readonly idsSha256: string;
  readonly profileContract: Readonly<{
    maximumDepth: 128;
    imageIterations: 32;
    points: readonly (readonly [number, number])[];
    constants: readonly (readonly [number, number])[];
    integrationWitnessFormulaId: string;
  }>;
  readonly traceContract: Readonly<{
    orbitSteps: 128;
    stateDimensions: 18;
    stateComparisons: 2304;
    flagComparisons: 2304;
  }>;
  readonly imageContract: Readonly<{
    width: 8;
    height: 6;
    iterations: 32;
    pixelComparisons: 96;
    minimumImageDifferingPixels: 1;
    relativeTolerance: 0.005;
  }>;
  readonly statusCounts: Readonly<{ passed: 7; blocked: 0 }>;
  readonly rowCount: 7;
  readonly rows: readonly JuliaClassicRegressionRendererEvidenceRowV1[];
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly contentHash: string;
}

const REPORT_KEYS = [
  "candidateManifestContentHash",
  "chunkSize",
  "durationMs",
  "executionSourceBindingsContentHash",
  "fullAuthorityRowCount",
  "fullGate",
  "idsSha256",
  "ok",
  "preGpuContentHash",
  "renderer",
  "rowCount",
  "rows",
  "runtimeDependencyBindings",
  "schema",
  "start",
  "statusCounts",
  "waveId",
  "workerBundleSha256",
] as const;
const REPORT_ROW_KEYS = [
  "binding",
  "bindingRevision",
  "candidateContentHash",
  "deterministicDoubleDraw",
  "evaluatedSemanticHash",
  "evaluatedSourceRevision",
  "formulaId",
  "fullFrameworkCappedDraw",
  "fullFrameworkCompileLink",
  "imagePixelComparisons",
  "observedImageDifferingPixels",
  "observedMaximumRelativeError",
  "profileDigest",
  "reasonCode",
  "rendererClass",
  "status",
  "supportLane",
  "traceFlagComparisons",
  "traceOrbitSteps",
  "traceStateComparisons",
  "traceStateDimensions",
] as const;
const EVIDENCE_KEYS = [
  "activationStatus",
  "authority",
  "contentHash",
  "correctiveContentHash",
  "correctiveWholeFileSha256",
  "durationMs",
  "executionSourceBindingsContentHash",
  "idsSha256",
  "imageContract",
  "privateReportContentHash",
  "privateReportWholeSha256",
  "profileContract",
  "renderer",
  "revision",
  "rowCount",
  "rows",
  "runtimeDependencyBindings",
  "schema",
  "sourceBindings",
  "statusCounts",
  "traceContract",
  "workerBundleSha256",
] as const;
const EVIDENCE_ROW_KEYS = [
  ...REPORT_ROW_KEYS,
  "minimumImageDifferingPixels",
  "receipt",
  "relativeTolerance",
] as const;

function isPlainRecord(value: unknown): value is UnknownRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactOwnKeys(
  value: UnknownRecord,
  expected: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(value);
  return (
    actual.every((key): key is string => typeof key === "string") &&
    actual.length === expected.length &&
    [...actual].sort().every((key, index) => key === [...expected].sort()[index])
  );
}

function isDenseArray(value: unknown, length: number): value is unknown[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  return Array.from({ length }, (_, index) =>
    Object.prototype.hasOwnProperty.call(value, index),
  ).every(Boolean);
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && SHA_256.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as UnknownRecord)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function snapshot(input: unknown): unknown {
  return JSON.parse(JSON.stringify(input)) as unknown;
}

function validShaMap(value: unknown): value is Record<string, string> {
  if (!isPlainRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length > 0 &&
    keys.every((key) => key.length > 0 && isSha(value[key]))
  );
}

function validRuntimeBindings(value: unknown): value is Record<string, string> {
  return (
    validShaMap(value) &&
    hasExactOwnKeys(value, JULIA_CLASSIC_REGRESSION_RENDERER_RUNTIME_KEYS_V1)
  );
}

function validPair(value: unknown): value is [number, number] {
  return (
    isDenseArray(value, 2) &&
    value.every((entry) => isFiniteNumber(entry))
  );
}

function validReportRow(
  row: unknown,
  index: number,
): row is JuliaClassicRegressionRendererReportRowV1 {
  if (!isPlainRecord(row) || !hasExactOwnKeys(row, REPORT_ROW_KEYS)) return false;
  if (
    row.formulaId !== JULIA_CLASSIC_REGRESSION_RENDERER_IDS_V1[index] ||
    typeof row.formulaId !== "string" ||
    !UUID_V5.test(row.formulaId) ||
    !isSha(row.candidateContentHash) ||
    !isSha(row.evaluatedSourceRevision) ||
    !isSha(row.evaluatedSemanticHash) ||
    !isSha(row.bindingRevision) ||
    !isSha(row.profileDigest) ||
    !isPlainRecord(row.binding) ||
    !hasExactOwnKeys(row.binding, ["kind", "sourceRevision"]) ||
    row.binding.kind !== "source-split" ||
    row.binding.sourceRevision !== row.evaluatedSourceRevision ||
    !(
      row.supportLane === "source-split-direct" ||
      row.supportLane === "source-split-transitive"
    ) ||
    row.status !== "passed" ||
    row.reasonCode !== null ||
    row.rendererClass !== "SwiftShader-software" ||
    row.fullFrameworkCompileLink !== true ||
    row.fullFrameworkCappedDraw !==
      (row.formulaId === JULIA_CLASSIC_REGRESSION_RENDERER_INTEGRATION_WITNESS_ID_V1) ||
    row.deterministicDoubleDraw !== true ||
    row.traceOrbitSteps !== 128 ||
    row.traceStateDimensions !== 18 ||
    row.traceStateComparisons !== 2304 ||
    row.traceFlagComparisons !== 2304 ||
    row.imagePixelComparisons !== 96 ||
    !Number.isSafeInteger(row.observedImageDifferingPixels) ||
    (row.observedImageDifferingPixels as number) < 1 ||
    (row.observedImageDifferingPixels as number) > 48 ||
    !isFiniteNumber(row.observedMaximumRelativeError) ||
    row.observedMaximumRelativeError < 0 ||
    row.observedMaximumRelativeError >
      JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1
  )
    return false;
  return true;
}

export function juliaClassicRegressionRendererReportContentHashV1(
  report: JuliaClassicRegressionRendererReportV1,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1(
      {
        domain: "fractalpark/7e-i/private-renderer-report/v1",
        report,
      },
      65_536,
    ),
  );
}

export function juliaClassicRegressionRendererEvidenceRowReceiptV1(
  row: Omit<JuliaClassicRegressionRendererEvidenceRowV1, "receipt">,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1(
      {
        domain: "fractalpark/7e-i/public-renderer-row/v1",
        row,
      },
      16_384,
    ),
  );
}

export function juliaClassicRegressionRendererEvidenceContentHashV1(
  body: Omit<JuliaClassicRegressionRendererEvidenceV1, "contentHash">,
): string {
  return sha256HexSyncV1(
    canonicalJsonV1(
      {
        domain: "fractalpark/7e-i/public-renderer-evidence/v1",
        body,
      },
      131_072,
    ),
  );
}

export function parseJuliaClassicRegressionRendererReportV1(
  input: unknown,
):
  | { readonly ok: true; readonly value: JuliaClassicRegressionRendererReportV1 }
  | { readonly ok: false; readonly code: string } {
  try {
    const value = snapshot(input);
    if (!isPlainRecord(value) || !hasExactOwnKeys(value, REPORT_KEYS))
      throw new Error("shape");
    if (
      value.schema !== JULIA_CLASSIC_REGRESSION_RENDERER_REPORT_SCHEMA_V1 ||
      value.ok !== true ||
      value.start !== 0 ||
      value.rowCount !== 7 ||
      value.fullAuthorityRowCount !== 7 ||
      value.fullGate !== true ||
      value.chunkSize !== 7 ||
      value.renderer !== JULIA_CLASSIC_REGRESSION_RENDERER_STRING_V1 ||
      !Number.isSafeInteger(value.durationMs) ||
      (value.durationMs as number) <= 0 ||
      !isSha(value.candidateManifestContentHash) ||
      value.waveId !== value.candidateManifestContentHash ||
      value.preGpuContentHash !== value.candidateManifestContentHash ||
      !isSha(value.executionSourceBindingsContentHash) ||
      !isSha(value.workerBundleSha256) ||
      !validRuntimeBindings(value.runtimeDependencyBindings) ||
      value.idsSha256 !==
        sha256HexSyncV1(JULIA_CLASSIC_REGRESSION_RENDERER_IDS_V1.join("\n")) ||
      !isPlainRecord(value.statusCounts) ||
      !hasExactOwnKeys(value.statusCounts, ["blocked", "passed"]) ||
      value.statusCounts.passed !== 7 ||
      value.statusCounts.blocked !== 0 ||
      !isDenseArray(value.rows, 7) ||
      !value.rows.every((row, index) => validReportRow(row, index))
    )
      throw new Error("contract");
    return {
      ok: true,
      value: deepFreeze(value as unknown as JuliaClassicRegressionRendererReportV1),
    };
  } catch {
    return {
      ok: false,
      code: "julia-classic-regression-renderer-report-invalid",
    };
  }
}

function validProfileContract(value: unknown): boolean {
  return (
    isPlainRecord(value) &&
    hasExactOwnKeys(value, [
      "constants",
      "imageIterations",
      "integrationWitnessFormulaId",
      "maximumDepth",
      "points",
    ]) &&
    value.maximumDepth === 128 &&
    value.imageIterations === 32 &&
    value.integrationWitnessFormulaId ===
      JULIA_CLASSIC_REGRESSION_RENDERER_INTEGRATION_WITNESS_ID_V1 &&
    isDenseArray(value.points, 3) &&
    value.points.every(validPair) &&
    isDenseArray(value.constants, 3) &&
    value.constants.every(validPair)
  );
}

function validEvidenceRow(
  row: unknown,
  index: number,
): row is JuliaClassicRegressionRendererEvidenceRowV1 {
  if (!isPlainRecord(row) || !hasExactOwnKeys(row, EVIDENCE_ROW_KEYS)) return false;
  const reportRow = Object.fromEntries(
    REPORT_ROW_KEYS.map((key) => [key, row[key]]),
  );
  if (
    !validReportRow(reportRow, index) ||
    row.minimumImageDifferingPixels !== 1 ||
    row.relativeTolerance !==
      JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1 ||
    !isSha(row.receipt)
  )
    return false;
  const receiptBody = {
    ...(reportRow as unknown as JuliaClassicRegressionRendererReportRowV1),
    minimumImageDifferingPixels: 1 as const,
    relativeTolerance:
      JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1 as 0.005,
  };
  return (
    row.receipt === juliaClassicRegressionRendererEvidenceRowReceiptV1(receiptBody)
  );
}

export function parseJuliaClassicRegressionRendererEvidenceV1(
  input: unknown,
):
  | { readonly ok: true; readonly value: JuliaClassicRegressionRendererEvidenceV1 }
  | { readonly ok: false; readonly code: string } {
  try {
    const value = snapshot(input);
    if (!isPlainRecord(value) || !hasExactOwnKeys(value, EVIDENCE_KEYS))
      throw new Error("shape");
    if (
      value.schema !== JULIA_CLASSIC_REGRESSION_RENDERER_CLOSURE_SCHEMA_V1 ||
      value.revision !== 1 ||
      value.authority !== "evidence-only" ||
      value.activationStatus !== false ||
      !isSha(value.correctiveContentHash) ||
      !isSha(value.correctiveWholeFileSha256) ||
      !isSha(value.privateReportWholeSha256) ||
      !isSha(value.privateReportContentHash) ||
      !isSha(value.executionSourceBindingsContentHash) ||
      !isSha(value.workerBundleSha256) ||
      !validRuntimeBindings(value.runtimeDependencyBindings) ||
      value.renderer !== JULIA_CLASSIC_REGRESSION_RENDERER_STRING_V1 ||
      !Number.isSafeInteger(value.durationMs) ||
      (value.durationMs as number) <= 0 ||
      value.idsSha256 !==
        sha256HexSyncV1(JULIA_CLASSIC_REGRESSION_RENDERER_IDS_V1.join("\n")) ||
      !validProfileContract(value.profileContract) ||
      !isPlainRecord(value.traceContract) ||
      !hasExactOwnKeys(value.traceContract, [
        "flagComparisons",
        "orbitSteps",
        "stateComparisons",
        "stateDimensions",
      ]) ||
      value.traceContract.orbitSteps !== 128 ||
      value.traceContract.stateDimensions !== 18 ||
      value.traceContract.stateComparisons !== 2304 ||
      value.traceContract.flagComparisons !== 2304 ||
      !isPlainRecord(value.imageContract) ||
      !hasExactOwnKeys(value.imageContract, [
        "height",
        "iterations",
        "minimumImageDifferingPixels",
        "pixelComparisons",
        "relativeTolerance",
        "width",
      ]) ||
      value.imageContract.width !== 8 ||
      value.imageContract.height !== 6 ||
      value.imageContract.iterations !== 32 ||
      value.imageContract.pixelComparisons !== 96 ||
      value.imageContract.minimumImageDifferingPixels !== 1 ||
      value.imageContract.relativeTolerance !==
        JULIA_CLASSIC_REGRESSION_RENDERER_RELATIVE_TOLERANCE_V1 ||
      !isPlainRecord(value.statusCounts) ||
      !hasExactOwnKeys(value.statusCounts, ["blocked", "passed"]) ||
      value.statusCounts.passed !== 7 ||
      value.statusCounts.blocked !== 0 ||
      value.rowCount !== 7 ||
      !isDenseArray(value.rows, 7) ||
      !value.rows.every((row, index) => validEvidenceRow(row, index)) ||
      !validShaMap(value.sourceBindings) ||
      !isSha(value.contentHash)
    )
      throw new Error("contract");
    const { contentHash, ...body } = value;
    if (
      contentHash !==
      juliaClassicRegressionRendererEvidenceContentHashV1(
        body as unknown as Omit<
          JuliaClassicRegressionRendererEvidenceV1,
          "contentHash"
        >,
      )
    )
      throw new Error("content-hash");
    return {
      ok: true,
      value: deepFreeze(value as unknown as JuliaClassicRegressionRendererEvidenceV1),
    };
  } catch {
    return {
      ok: false,
      code: "julia-classic-regression-renderer-evidence-invalid",
    };
  }
}
