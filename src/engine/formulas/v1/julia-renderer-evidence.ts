import type { JuliaPreGpuCapabilityRowV1 } from "./julia-pre-gpu-capability";
import type { PublishedFormulaRuntimeIndexRowV1 } from "./published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V5 =
  /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CANONICAL_NODE_BUDGET = 131_072;

export const JULIA_RENDERER_EVIDENCE_SCHEMA_V1 =
  "fractalpark-julia-renderer-evidence/v1" as const;
export const JULIA_RENDERER_PROFILE_SCHEMA_V1 =
  "fractalpark-julia-renderer-profile/v1" as const;
export const JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 = 185 as const;
export const JULIA_RENDERER_MAX_DEPTH_V1 = 128 as const;
export const JULIA_RENDERER_IMAGE_ITERATIONS_V1 = 32 as const;
export const JULIA_RENDERER_DEPTHS_V1 = Object.freeze([
  1, 2, 4, 8, 16, 32, 64, 128,
] as const);
export const JULIA_RENDERER_IMAGE_WIDTH_V1 = 8 as const;
export const JULIA_RENDERER_IMAGE_HEIGHT_V1 = 6 as const;
export const JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1 = Object.freeze([
  "00e14aa8-b766-54ea-a359-3f5d20d329b7",
] as const);
export const JULIA_RENDERER_POINTS_V1 = Object.freeze([
  Object.freeze([-0.35, 0.2] as const),
  Object.freeze([0.12, -0.28] as const),
  Object.freeze([0.43, 0.11] as const),
]);
export const JULIA_RENDERER_CONSTANTS_V1 = Object.freeze([
  Object.freeze([-0.7, 0.27] as const),
  Object.freeze([0.285, 0.01] as const),
  Object.freeze([-0.1542022, 0.6137691] as const),
]);

export const JULIA_RENDERER_SOURCE_BINDING_PATHS_V1 = Object.freeze([
  "package-lock.json",
  "package.json",
  "public/formula-library/v1/runtime/published/index.json",
  "resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json",
  "scripts/run-julia-tier2-webgl-worker.ts",
  "scripts/verify-julia-tier2-webgl.ts",
  "scripts/build-julia-renderer-evidence.ts",
  "src/engine/formulas/v1/julia-renderer-evidence.ts",
  "src/engine/formulas/v1/julia-pre-gpu-capability.ts",
  "src/engine/formulas/v1/published-adapter.ts",
  "src/engine/formulas/v1/published-runtime.ts",
  "src/engine/formulas/v1/revisions.ts",
  "src/engine/formulas/v1/safety-envelope.ts",
  "src/engine/formulas/v1/types.ts",
  "src/engine/frm/frm-v1-glsl-prelude.ts",
  "src/engine/frm/v1-backend.ts",
  "src/engine/frm/frm-v1-stdlib.ts",
  "src/engine/frm/v1.ts",
  "src/engine/plugins/builtins/coloring/inside-black.ts",
  "src/engine/plugins/builtins/coloring/smooth.ts",
  "src/engine/plugins/builtins/transforms/none.ts",
  "src/engine/plugins/registry.ts",
  "src/engine/plugins/types.ts",
  "src/engine/shaders/assembler.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/shaders/framework.frag.glsl",
  "src/engine/shaders/palettes.glsl",
  "tsconfig.json",
] as const);

export interface JuliaRendererProfileV1 {
  readonly schema: typeof JULIA_RENDERER_PROFILE_SCHEMA_V1;
  readonly purpose: "renderer-evidence-only-not-default-selection";
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly bindingRevision: string;
  readonly lane: "existing-system-c" | "source-split";
  readonly modeClass: "classic-julia";
  readonly parameters: Readonly<
    Record<string, number | string | readonly [number, number]>
  >;
  readonly mode: "julia";
  readonly juliaC: readonly [number, number];
  readonly view: Readonly<{
    centerX: number;
    centerY: number;
    zoom: number;
    rotation: number;
  }>;
  readonly iterations: typeof JULIA_RENDERER_IMAGE_ITERATIONS_V1;
}

export interface JuliaRendererEvidenceRowV1 {
  readonly formulaId: string;
  readonly evaluatedSourceRevision: string;
  readonly evaluatedSemanticHash: string;
  readonly bindingRevision: string;
  readonly lane: "existing-system-c" | "source-split";
  readonly modeClass: "classic-julia";
  readonly profileDigest: string;
  readonly status: "passed" | "blocked";
  readonly reasonCode: null | string;
  readonly rendererClass: "SwiftShader-software";
  readonly fullFrameworkCompileLink: boolean;
  readonly fullFrameworkCappedDraw: boolean;
  readonly deterministicDoubleDraw: boolean;
  readonly traceDepthComparisons: number;
  readonly imagePixelComparisons: number;
  readonly minimumImageDifferingPixels: 1;
  readonly relativeTolerance: 0.005;
}

export type JuliaRendererReportRowV1 = Omit<
  JuliaRendererEvidenceRowV1,
  "minimumImageDifferingPixels" | "relativeTolerance"
> & {
  readonly observedImageDifferingPixels: number;
  readonly observedMaximumRelativeError: number;
};

export interface JuliaRendererEvidenceV1 {
  readonly schema: typeof JULIA_RENDERER_EVIDENCE_SCHEMA_V1;
  readonly revision: 1;
  readonly stage: "tier2-renderer-closure";
  readonly activationStatus: "inactive-evidence-only";
  readonly rendererPolicy: "Chromium-WebGL1-SwiftShader-software";
  readonly tier3Scope: Readonly<{
    schema: "fractalpark-julia-tier3-scope/v1";
    status: "pending-physical-device-evidence";
    stratification: readonly ["family", "backend-risk", "lane", "numeric-risk"];
    physicalDeviceSampleCount: 0;
    crossDeviceGuarantee: false;
  }>;
  readonly preGpuContentHash: string;
  readonly preGpuRowMapContentHash: string;
  readonly integrationWitnessFormulaIds: typeof JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1;
  readonly integrationWitnessCount: 1;
  readonly sourceBindings: Readonly<Record<string, string>>;
  readonly rowCount: typeof JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1;
  readonly statusCounts: Readonly<{ passed: number; blocked: number }>;
  readonly rows: readonly JuliaRendererEvidenceRowV1[];
  readonly contentHash: string;
}

export type JuliaRendererEvidenceParseResultV1 =
  | { readonly ok: true; readonly value: JuliaRendererEvidenceV1 }
  | { readonly ok: false; readonly code: "julia-renderer-evidence-invalid" };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.every((key) => typeof key === "string") &&
    [...(keys as string[])].sort().join("\u0000") ===
      [...expected].sort().join("\u0000")
  );
}

function cloneDefault(
  value: number | string | readonly [number, number],
): number | string | readonly [number, number] {
  return Array.isArray(value)
    ? Object.freeze([Number(value[0]), Number(value[1])] as const)
    : value;
}

export function buildJuliaRendererProfileV1(
  runtimeRow: PublishedFormulaRuntimeIndexRowV1,
  preGpuRow: JuliaPreGpuCapabilityRowV1,
): Readonly<{ profile: JuliaRendererProfileV1; profileDigest: string }> {
  if (
    runtimeRow.formulaId !== preGpuRow.formulaId ||
    preGpuRow.disposition !== "tier2-pending" ||
    (preGpuRow.lane !== "existing-system-c" &&
      preGpuRow.lane !== "source-split") ||
    preGpuRow.modeClass !== "classic-julia" ||
    !preGpuRow.bindingRevision
  )
    throw new Error("julia-renderer-profile-input-invalid");
  const parameters: Record<
    string,
    number | string | readonly [number, number]
  > = {};
  for (const parameter of runtimeRow.parameters) {
    if (Object.hasOwn(parameters, parameter.slotName))
      throw new Error("julia-renderer-profile-parameter-duplicate");
    parameters[parameter.slotName] = cloneDefault(parameter.default);
  }
  const profile: JuliaRendererProfileV1 = Object.freeze({
    schema: JULIA_RENDERER_PROFILE_SCHEMA_V1,
    purpose: "renderer-evidence-only-not-default-selection",
    formulaId: preGpuRow.formulaId,
    sourceRevision: preGpuRow.evaluatedSourceRevision,
    semanticHash: preGpuRow.evaluatedSemanticHash,
    bindingRevision: preGpuRow.bindingRevision,
    lane: preGpuRow.lane,
    modeClass: "classic-julia",
    parameters: Object.freeze(parameters),
    mode: "julia",
    juliaC: JULIA_RENDERER_CONSTANTS_V1[0],
    view: Object.freeze({
      centerX: runtimeRow.profile.center[0],
      centerY: runtimeRow.profile.center[1],
      zoom: runtimeRow.profile.zoom,
      rotation: runtimeRow.profile.rotation,
    }),
    iterations: JULIA_RENDERER_IMAGE_ITERATIONS_V1,
  });
  return Object.freeze({
    profile,
    profileDigest: sha256HexSyncV1(
      canonicalJsonV1(profile, CANONICAL_NODE_BUDGET),
    ),
  });
}

function parseRow(value: unknown): value is JuliaRendererEvidenceRowV1 {
  if (
    !record(value) ||
    !exactKeys(value, [
      "formulaId",
      "evaluatedSourceRevision",
      "evaluatedSemanticHash",
      "bindingRevision",
      "lane",
      "modeClass",
      "profileDigest",
      "status",
      "reasonCode",
      "rendererClass",
      "fullFrameworkCompileLink",
      "fullFrameworkCappedDraw",
      "deterministicDoubleDraw",
      "traceDepthComparisons",
      "imagePixelComparisons",
      "minimumImageDifferingPixels",
      "relativeTolerance",
    ]) ||
    typeof value.formulaId !== "string" ||
    !UUID_V5.test(value.formulaId) ||
    typeof value.evaluatedSourceRevision !== "string" ||
    !SHA256.test(value.evaluatedSourceRevision) ||
    typeof value.evaluatedSemanticHash !== "string" ||
    !SHA256.test(value.evaluatedSemanticHash) ||
    typeof value.bindingRevision !== "string" ||
    !SHA256.test(value.bindingRevision) ||
    (value.lane !== "existing-system-c" && value.lane !== "source-split") ||
    value.modeClass !== "classic-julia" ||
    typeof value.profileDigest !== "string" ||
    !SHA256.test(value.profileDigest) ||
    (value.status !== "passed" && value.status !== "blocked") ||
    (value.reasonCode !== null && typeof value.reasonCode !== "string") ||
    value.rendererClass !== "SwiftShader-software" ||
    typeof value.fullFrameworkCompileLink !== "boolean" ||
    typeof value.fullFrameworkCappedDraw !== "boolean" ||
    typeof value.deterministicDoubleDraw !== "boolean" ||
    !Number.isSafeInteger(value.traceDepthComparisons) ||
    (value.traceDepthComparisons as number) < 0 ||
    !Number.isSafeInteger(value.imagePixelComparisons) ||
    (value.imagePixelComparisons as number) < 0 ||
    value.minimumImageDifferingPixels !== 1 ||
    value.relativeTolerance !== 0.005
  )
    return false;
  if (value.status === "passed") {
    return (
      value.reasonCode === null &&
      value.fullFrameworkCompileLink === true &&
      value.deterministicDoubleDraw === true &&
      value.traceDepthComparisons ===
        (3 + 3 * 3) * JULIA_RENDERER_DEPTHS_V1.length &&
      value.imagePixelComparisons ===
        2 * JULIA_RENDERER_IMAGE_WIDTH_V1 * JULIA_RENDERER_IMAGE_HEIGHT_V1
    );
  }
  return typeof value.reasonCode === "string" && value.reasonCode.length > 0;
}

export function parseJuliaRendererEvidenceV1(
  value: unknown,
): JuliaRendererEvidenceParseResultV1 {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "schema",
        "revision",
        "stage",
        "activationStatus",
        "rendererPolicy",
        "tier3Scope",
        "preGpuContentHash",
        "preGpuRowMapContentHash",
        "integrationWitnessFormulaIds",
        "integrationWitnessCount",
        "sourceBindings",
        "rowCount",
        "statusCounts",
        "rows",
        "contentHash",
      ]) ||
      value.schema !== JULIA_RENDERER_EVIDENCE_SCHEMA_V1 ||
      value.revision !== 1 ||
      value.stage !== "tier2-renderer-closure" ||
      value.activationStatus !== "inactive-evidence-only" ||
      value.rendererPolicy !== "Chromium-WebGL1-SwiftShader-software" ||
      typeof value.preGpuContentHash !== "string" ||
      !SHA256.test(value.preGpuContentHash) ||
      typeof value.preGpuRowMapContentHash !== "string" ||
      !SHA256.test(value.preGpuRowMapContentHash) ||
      !Array.isArray(value.integrationWitnessFormulaIds) ||
      value.integrationWitnessFormulaIds.join("\u0000") !==
        JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1.join("\u0000") ||
      value.integrationWitnessCount !== 1 ||
      !record(value.sourceBindings) ||
      !exactKeys(
        value.sourceBindings,
        JULIA_RENDERER_SOURCE_BINDING_PATHS_V1,
      ) ||
      !Object.values(value.sourceBindings).every(
        (entry) => typeof entry === "string" && SHA256.test(entry),
      ) ||
      value.rowCount !== JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 ||
      !record(value.statusCounts) ||
      !exactKeys(value.statusCounts, ["passed", "blocked"]) ||
      !Number.isSafeInteger(value.statusCounts.passed) ||
      !Number.isSafeInteger(value.statusCounts.blocked) ||
      !Array.isArray(value.rows) ||
      value.rows.length !== JULIA_RENDERER_EVIDENCE_ROW_COUNT_V1 ||
      !value.rows.every(parseRow) ||
      typeof value.contentHash !== "string" ||
      !SHA256.test(value.contentHash)
    )
      return { ok: false, code: "julia-renderer-evidence-invalid" };
    const tier3 = value.tier3Scope;
    if (
      !record(tier3) ||
      !exactKeys(tier3, [
        "schema",
        "status",
        "stratification",
        "physicalDeviceSampleCount",
        "crossDeviceGuarantee",
      ]) ||
      tier3.schema !== "fractalpark-julia-tier3-scope/v1" ||
      tier3.status !== "pending-physical-device-evidence" ||
      !Array.isArray(tier3.stratification) ||
      tier3.stratification.join("\u0000") !==
        ["family", "backend-risk", "lane", "numeric-risk"].join("\u0000") ||
      tier3.physicalDeviceSampleCount !== 0 ||
      tier3.crossDeviceGuarantee !== false
    )
      return { ok: false, code: "julia-renderer-evidence-invalid" };
    const rows = value.rows as unknown as JuliaRendererEvidenceRowV1[];
    const sorted = [...rows].sort((left, right) =>
      left.formulaId.localeCompare(right.formulaId),
    );
    if (
      rows.some((row, index) => row.formulaId !== sorted[index]?.formulaId) ||
      new Set(rows.map((row) => row.formulaId)).size !== rows.length ||
      value.statusCounts.passed !==
        rows.filter((row) => row.status === "passed").length ||
      value.statusCounts.blocked !==
        rows.filter((row) => row.status === "blocked").length ||
      value.statusCounts.passed + value.statusCounts.blocked !== rows.length ||
      rows.filter((row) => row.fullFrameworkCappedDraw).length !== 1 ||
      rows.some(
        (row) =>
          row.fullFrameworkCappedDraw !==
          JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1.includes(
            row.formulaId as (typeof JULIA_RENDERER_INTEGRATION_WITNESS_FORMULA_IDS_V1)[number],
          ),
      )
    )
      return { ok: false, code: "julia-renderer-evidence-invalid" };
    const content = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "contentHash"),
    );
    if (
      value.contentHash !==
      sha256HexSyncV1(canonicalJsonV1(content, CANONICAL_NODE_BUDGET))
    )
      return { ok: false, code: "julia-renderer-evidence-invalid" };
    return {
      ok: true,
      value: Object.freeze(value) as unknown as JuliaRendererEvidenceV1,
    };
  } catch {
    return { ok: false, code: "julia-renderer-evidence-invalid" };
  }
}
