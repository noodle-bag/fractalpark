import type { OrbitConstantBindingV1 } from "./julia-binding";
import type { JuliaPreGpuRecoveryRowV2 } from "./julia-pre-gpu-recovery-v2";
import type { PublishedFormulaRuntimeIndexRowV1 } from "./published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

export const JULIA_RENDERER_EVIDENCE_SCHEMA_V2 =
  "fractalpark-julia-renderer-evidence/v2" as const;
export const JULIA_RENDERER_PROFILE_SCHEMA_V2 =
  "fractalpark-julia-renderer-profile/v2" as const;
export const JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 = 236 as const;
export const JULIA_RENDERER_MAX_DEPTH_V2 = 128 as const;
export const JULIA_RENDERER_TRACE_STATE_DIMENSIONS_V2 = 18 as const;
export const JULIA_RENDERER_TRACE_STATE_COMPARISONS_V2 = 128 * 18;
export const JULIA_RENDERER_IMAGE_ITERATIONS_V2 = 32 as const;
export const JULIA_RENDERER_IMAGE_WIDTH_V2 = 8 as const;
export const JULIA_RENDERER_IMAGE_HEIGHT_V2 = 6 as const;
export const JULIA_RENDERER_IMAGE_COMPARISONS_V2 = 2 * 8 * 6;
export const JULIA_RENDERER_RELATIVE_TOLERANCE_V2 = 0.005 as const;
export const JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2 =
  "00e14aa8-b766-54ea-a359-3f5d20d329b7" as const;
export const JULIA_RENDERER_POINTS_V2 = Object.freeze([
  Object.freeze([-0.35, 0.2] as const),
  Object.freeze([0.12, -0.28] as const),
  Object.freeze([0.43, 0.11] as const),
]);
export const JULIA_RENDERER_CONSTANTS_V2 = Object.freeze([
  Object.freeze([-0.7, 0.27] as const),
  Object.freeze([0.285, 0.01] as const),
  Object.freeze([-0.1542022, 0.6137691] as const),
]);

export interface JuliaRendererProfileV2 {
  readonly schema: typeof JULIA_RENDERER_PROFILE_SCHEMA_V2;
  readonly purpose: "renderer-evidence-only-not-default-selection";
  readonly formulaId: string;
  readonly candidateContentHash: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly binding: OrbitConstantBindingV1;
  readonly bindingRevision: string;
  readonly supportLane:
    | "existing-system-c"
    | "parameter-binding"
    | "source-split-direct"
    | "source-split-transitive";
  readonly parameters: Readonly<
    Record<string, number | string | readonly [number, number]>
  >;
  readonly view: Readonly<{
    centerX: number;
    centerY: number;
    zoom: number;
    rotation: number;
  }>;
  readonly iterations: 32;
}

export interface JuliaRendererReportRowV2 {
  readonly formulaId: string;
  readonly candidateContentHash: string;
  readonly evaluatedSourceRevision: string;
  readonly evaluatedSemanticHash: string;
  readonly binding: OrbitConstantBindingV1;
  readonly bindingRevision: string;
  readonly supportLane: JuliaRendererProfileV2["supportLane"];
  readonly profileDigest: string;
  readonly status: "passed" | "blocked";
  readonly reasonCode: string | null;
  readonly rendererClass: "SwiftShader-software";
  readonly fullFrameworkCompileLink: boolean;
  readonly fullFrameworkCappedDraw: boolean;
  readonly deterministicDoubleDraw: boolean;
  readonly traceOrbitSteps: number;
  readonly traceStateDimensions: number;
  readonly traceStateComparisons: number;
  readonly traceFlagComparisons: number;
  readonly imagePixelComparisons: number;
  readonly observedImageDifferingPixels: number;
  readonly observedMaximumRelativeError: number;
}

export type JuliaRendererEvidenceRowV2 = Omit<
  JuliaRendererReportRowV2,
  "observedImageDifferingPixels" | "observedMaximumRelativeError"
> & {
  readonly minimumImageDifferingPixels: 1;
  readonly relativeTolerance: 0.005;
};

export interface JuliaRendererEvidenceV2 {
  readonly schema: typeof JULIA_RENDERER_EVIDENCE_SCHEMA_V2;
  readonly revision: 2;
  readonly stage: "tier2-renderer-v2-closure";
  readonly authority: Readonly<{
    authorityState: "sealed";
    supersededBy: null;
    withdrawnBy: null;
  }>;
  readonly activationStatus: "inactive-evidence-only";
  readonly rendererPolicy: "Chromium-WebGL2-SwiftShader-software";
  readonly runtimeDependencyBindings: Readonly<{
    readonly "@playwright/test": string;
    readonly playwright: string;
    readonly "playwright-core": string;
    readonly "chromium-runtime": string;
  }>;
  readonly tier3Scope: Readonly<{
    physicalDeviceSampleCount: 0;
    crossDeviceGuarantee: false;
  }>;
  readonly candidateManifestContentHash: string;
  readonly waveId: string;
  readonly preGpuContentHash: string;
  readonly integrationWitnessFormulaId: string;
  readonly integrationWitnessCount: 1;
  readonly traceContract: Readonly<{
    orbitSteps: 128;
    stateDimensions: 18;
    stateComparisonsPerRow: 2304;
    flagComparisonsPerRow: 2304;
  }>;
  readonly imageContract: Readonly<{
    width: 8;
    height: 6;
    iterations: 32;
    constantCount: 2;
    pixelComparisonsPerRow: 96;
    minimumDifferingPixels: 1;
    relativeTolerance: 0.005;
  }>;
  readonly sealedHoldout: Readonly<{
    stage: "sealed";
    candidateManifestContentHash: string;
    waveId: string;
    sealedCorpusDigest: string;
    e1CandidateCount: 0;
    sealedAttemptCount: 0;
    attemptManifestContentHash: string;
    sealedLedgerContentHash: string;
  }>;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: 236;
  readonly statusCounts: Readonly<{ passed: number; blocked: number }>;
  readonly rows: readonly JuliaRendererEvidenceRowV2[];
  readonly contentHash: string;
}

export type JuliaRendererEvidenceParseResultV2 =
  | { readonly ok: true; readonly value: JuliaRendererEvidenceV2 }
  | { readonly ok: false; readonly code: "julia-renderer-evidence-v2-invalid" };

type JsonRecord = Record<string, unknown>;
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CANONICAL_NODE_BUDGET = 1_048_576;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && "value" in descriptor;
    })
  );
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key): key is string => typeof key === "string") &&
    [...keys].sort().join("|") === [...expected].sort().join("|")
  );
}

function dense(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  return value.every((_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    return descriptor !== undefined && "value" in descriptor;
  });
}

function immutable<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable)) as T;
  if (record(value)) {
    const output: JsonRecord = {};
    for (const [key, child] of Object.entries(value)) output[key] = immutable(child);
    return Object.freeze(output) as T;
  }
  return value;
}

function cloneDefault(
  value: number | string | readonly [number, number],
): number | string | readonly [number, number] {
  return Array.isArray(value)
    ? Object.freeze([Number(value[0]), Number(value[1])] as const)
    : value;
}

export function buildJuliaRendererProfileV2(
  runtimeRow: PublishedFormulaRuntimeIndexRowV1,
  preGpuRow: JuliaPreGpuRecoveryRowV2,
): Readonly<{ profile: JuliaRendererProfileV2; profileDigest: string }> {
  if (
    runtimeRow.formulaId !== preGpuRow.formulaId ||
    preGpuRow.status !== "tier2-queue" ||
    preGpuRow.evaluatedSourceRevision === null ||
    preGpuRow.evaluatedSemanticHash === null ||
    preGpuRow.binding === null ||
    preGpuRow.bindingRevision === null ||
    preGpuRow.candidateContentHash === null ||
    preGpuRow.supportLane === "none"
  )
    throw new Error("julia-renderer-profile-v2-input-invalid");
  const parameters: Record<
    string,
    number | string | readonly [number, number]
  > = {};
  for (const parameter of runtimeRow.parameters) {
    if (Object.hasOwn(parameters, parameter.slotName))
      throw new Error("julia-renderer-profile-v2-parameter-duplicate");
    parameters[parameter.slotName] = cloneDefault(parameter.default);
  }
  const profile: JuliaRendererProfileV2 = Object.freeze({
    schema: JULIA_RENDERER_PROFILE_SCHEMA_V2,
    purpose: "renderer-evidence-only-not-default-selection",
    formulaId: preGpuRow.formulaId,
    candidateContentHash: preGpuRow.candidateContentHash,
    sourceRevision: preGpuRow.evaluatedSourceRevision,
    semanticHash: preGpuRow.evaluatedSemanticHash,
    binding: immutable(preGpuRow.binding),
    bindingRevision: preGpuRow.bindingRevision,
    supportLane: preGpuRow.supportLane,
    parameters: Object.freeze(parameters),
    view: Object.freeze({
      centerX: runtimeRow.profile.center[0],
      centerY: runtimeRow.profile.center[1],
      zoom: runtimeRow.profile.zoom,
      rotation: runtimeRow.profile.rotation,
    }),
    iterations: JULIA_RENDERER_IMAGE_ITERATIONS_V2,
  });
  return Object.freeze({
    profile,
    profileDigest: sha256HexSyncV1(canonicalJsonV1(profile, 32_768)),
  });
}

function parseBinding(value: unknown): value is OrbitConstantBindingV1 {
  if (!record(value) || typeof value.kind !== "string") return false;
  if (value.kind === "system-c") return exactKeys(value, ["kind"]);
  if (value.kind === "parameter")
    return exactKeys(value, ["kind", "slotName"]) && typeof value.slotName === "string";
  if (value.kind === "source-split")
    return (
      exactKeys(value, ["kind", "sourceRevision"]) &&
      typeof value.sourceRevision === "string" &&
      SHA256.test(value.sourceRevision)
    );
  return false;
}

function parseRow(value: unknown): value is JuliaRendererEvidenceRowV2 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "formulaId",
      "candidateContentHash",
      "evaluatedSourceRevision",
      "evaluatedSemanticHash",
      "binding",
      "bindingRevision",
      "supportLane",
      "profileDigest",
      "status",
      "reasonCode",
      "rendererClass",
      "fullFrameworkCompileLink",
      "fullFrameworkCappedDraw",
      "deterministicDoubleDraw",
      "traceOrbitSteps",
      "traceStateDimensions",
      "traceStateComparisons",
      "traceFlagComparisons",
      "imagePixelComparisons",
      "minimumImageDifferingPixels",
      "relativeTolerance",
    ]) ||
    typeof value.formulaId !== "string" ||
    !UUID_V5.test(value.formulaId) ||
    typeof value.candidateContentHash !== "string" ||
    !SHA256.test(value.candidateContentHash) ||
    typeof value.evaluatedSourceRevision !== "string" ||
    !SHA256.test(value.evaluatedSourceRevision) ||
    typeof value.evaluatedSemanticHash !== "string" ||
    !SHA256.test(value.evaluatedSemanticHash) ||
    !parseBinding(value.binding) ||
    typeof value.bindingRevision !== "string" ||
    !SHA256.test(value.bindingRevision) ||
    ![
      "existing-system-c",
      "parameter-binding",
      "source-split-direct",
      "source-split-transitive",
    ].includes(String(value.supportLane)) ||
    typeof value.profileDigest !== "string" ||
    !SHA256.test(value.profileDigest) ||
    (value.status !== "passed" && value.status !== "blocked") ||
    (value.reasonCode !== null && typeof value.reasonCode !== "string") ||
    value.rendererClass !== "SwiftShader-software" ||
    typeof value.fullFrameworkCompileLink !== "boolean" ||
    typeof value.fullFrameworkCappedDraw !== "boolean" ||
    typeof value.deterministicDoubleDraw !== "boolean" ||
    !Number.isSafeInteger(value.traceOrbitSteps) ||
    !Number.isSafeInteger(value.traceStateDimensions) ||
    !Number.isSafeInteger(value.traceStateComparisons) ||
    !Number.isSafeInteger(value.traceFlagComparisons) ||
    !Number.isSafeInteger(value.imagePixelComparisons) ||
    value.minimumImageDifferingPixels !== 1 ||
    value.relativeTolerance !== 0.005
  )
    return false;
  if (value.status === "passed") {
    return (
      value.reasonCode === null &&
      value.fullFrameworkCompileLink === true &&
      value.deterministicDoubleDraw === true &&
      value.traceOrbitSteps === 128 &&
      value.traceStateDimensions === 18 &&
      value.traceStateComparisons === 2304 &&
      value.traceFlagComparisons === 2304 &&
      value.imagePixelComparisons === 96 &&
      value.fullFrameworkCappedDraw ===
        (value.formulaId === JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2)
    );
  }
  return (
    typeof value.reasonCode === "string" &&
    value.reasonCode.length > 0 &&
    value.deterministicDoubleDraw === false &&
    value.traceOrbitSteps === 0 &&
    value.traceStateDimensions === 0 &&
    value.traceStateComparisons === 0 &&
    value.traceFlagComparisons === 0 &&
    value.imagePixelComparisons === 0 &&
    value.fullFrameworkCappedDraw === false
  );
}

export function parseJuliaRendererEvidenceV2(
  input: unknown,
): JuliaRendererEvidenceParseResultV2 {
  try {
    if (
      !record(input) ||
      !exactKeys(input, [
        "schema",
        "revision",
        "stage",
        "authority",
        "activationStatus",
        "rendererPolicy",
        "runtimeDependencyBindings",
        "tier3Scope",
        "candidateManifestContentHash",
        "waveId",
        "preGpuContentHash",
        "integrationWitnessFormulaId",
        "integrationWitnessCount",
        "traceContract",
        "imageContract",
        "sealedHoldout",
        "sourceBindings",
        "rowCount",
        "statusCounts",
        "rows",
        "contentHash",
      ]) ||
      input.schema !== JULIA_RENDERER_EVIDENCE_SCHEMA_V2 ||
      input.revision !== 2 ||
      input.stage !== "tier2-renderer-v2-closure" ||
      !record(input.authority) ||
      !exactKeys(input.authority, ["authorityState", "supersededBy", "withdrawnBy"]) ||
      input.authority.authorityState !== "sealed" ||
      input.authority.supersededBy !== null ||
      input.authority.withdrawnBy !== null ||
      input.activationStatus !== "inactive-evidence-only" ||
      input.rendererPolicy !== "Chromium-WebGL2-SwiftShader-software" ||
      !record(input.runtimeDependencyBindings) ||
      !exactKeys(input.runtimeDependencyBindings, [
        "@playwright/test",
        "playwright",
        "playwright-core",
        "chromium-runtime",
      ]) ||
      Object.values(input.runtimeDependencyBindings).some(
        (value) => typeof value !== "string" || !SHA256.test(value),
      ) ||
      !record(input.tier3Scope) ||
      !exactKeys(input.tier3Scope, [
        "physicalDeviceSampleCount",
        "crossDeviceGuarantee",
      ]) ||
      input.tier3Scope.physicalDeviceSampleCount !== 0 ||
      input.tier3Scope.crossDeviceGuarantee !== false ||
      typeof input.candidateManifestContentHash !== "string" ||
      !SHA256.test(input.candidateManifestContentHash) ||
      input.waveId !== input.candidateManifestContentHash ||
      typeof input.preGpuContentHash !== "string" ||
      !SHA256.test(input.preGpuContentHash) ||
      input.integrationWitnessFormulaId !==
        JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2 ||
      input.integrationWitnessCount !== 1 ||
      !record(input.traceContract) ||
      !exactKeys(input.traceContract, [
        "orbitSteps",
        "stateDimensions",
        "stateComparisonsPerRow",
        "flagComparisonsPerRow",
      ]) ||
      input.traceContract.orbitSteps !== 128 ||
      input.traceContract.stateDimensions !== 18 ||
      input.traceContract.stateComparisonsPerRow !== 2304 ||
      input.traceContract.flagComparisonsPerRow !== 2304 ||
      !record(input.imageContract) ||
      !exactKeys(input.imageContract, [
        "width",
        "height",
        "iterations",
        "constantCount",
        "pixelComparisonsPerRow",
        "minimumDifferingPixels",
        "relativeTolerance",
      ]) ||
      input.imageContract.width !== 8 ||
      input.imageContract.height !== 6 ||
      input.imageContract.iterations !== 32 ||
      input.imageContract.constantCount !== 2 ||
      input.imageContract.pixelComparisonsPerRow !== 96 ||
      input.imageContract.minimumDifferingPixels !== 1 ||
      input.imageContract.relativeTolerance !== 0.005 ||
      !record(input.sealedHoldout) ||
      !exactKeys(input.sealedHoldout, [
        "stage",
        "candidateManifestContentHash",
        "waveId",
        "sealedCorpusDigest",
        "e1CandidateCount",
        "sealedAttemptCount",
        "attemptManifestContentHash",
        "sealedLedgerContentHash",
      ]) ||
      input.sealedHoldout.stage !== "sealed" ||
      input.sealedHoldout.candidateManifestContentHash !== input.waveId ||
      input.sealedHoldout.waveId !== input.waveId ||
      typeof input.sealedHoldout.sealedCorpusDigest !== "string" ||
      !SHA256.test(input.sealedHoldout.sealedCorpusDigest) ||
      input.sealedHoldout.e1CandidateCount !== 0 ||
      input.sealedHoldout.sealedAttemptCount !== 0 ||
      typeof input.sealedHoldout.attemptManifestContentHash !== "string" ||
      !SHA256.test(input.sealedHoldout.attemptManifestContentHash) ||
      typeof input.sealedHoldout.sealedLedgerContentHash !== "string" ||
      !SHA256.test(input.sealedHoldout.sealedLedgerContentHash) ||
      !record(input.sourceBindings) ||
      Object.keys(input.sourceBindings).length === 0 ||
      Object.values(input.sourceBindings).some(
        (value) => typeof value !== "string" || !SHA256.test(value),
      ) ||
      input.rowCount !== JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 ||
      !record(input.statusCounts) ||
      !exactKeys(input.statusCounts, ["passed", "blocked"]) ||
      !Number.isSafeInteger(input.statusCounts.passed) ||
      !Number.isSafeInteger(input.statusCounts.blocked) ||
      !dense(input.rows) ||
      input.rows.length !== JULIA_RENDERER_EVIDENCE_ROW_COUNT_V2 ||
      !input.rows.every(parseRow) ||
      typeof input.contentHash !== "string" ||
      !SHA256.test(input.contentHash)
    )
      throw new Error("shape");
    const rows = input.rows as unknown as JuliaRendererEvidenceRowV2[];
    if (
      rows.some((row, index) => index > 0 && rows[index - 1]!.formulaId >= row.formulaId) ||
      new Set(rows.map((row) => row.formulaId)).size !== rows.length ||
      rows.filter((row) => row.status === "passed").length !== input.statusCounts.passed ||
      rows.filter((row) => row.status === "blocked").length !== input.statusCounts.blocked ||
      input.statusCounts.passed + input.statusCounts.blocked !== rows.length ||
      rows.filter((row) => row.fullFrameworkCappedDraw).length !== 1
    )
      throw new Error("rows");
    const content = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "contentHash"),
    );
    if (
      input.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    )
      throw new Error("hash");
    return {
      ok: true,
      value: immutable(input) as unknown as JuliaRendererEvidenceV2,
    };
  } catch {
    return { ok: false, code: "julia-renderer-evidence-v2-invalid" };
  }
}
