import type { OrbitConstantBindingV1 } from "./julia-binding";
import type { JuliaClassicRegressionCorrectiveRowV1 } from "./julia-classic-regression-corrective-v1";
import type { PublishedFormulaRuntimeIndexRowV1 } from "./published-runtime";
import { canonicalJsonV1, sha256HexSyncV1 } from "./revisions";

/** Exact-seven phase-2 contract.  It deliberately does not alter the sealed v2 contract. */
export const JULIA_CLASSIC_REGRESSION_RENDERER_EVIDENCE_SCHEMA_V1 =
  "fractalpark-julia-classic-regression-renderer-evidence/v1" as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_ROW_COUNT_V1 = 7 as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_MAX_DEPTH_V2 = 128 as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_ITERATIONS_V2 = 32 as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_WIDTH_V2 = 8 as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_IMAGE_HEIGHT_V2 = 6 as const;
export const JULIA_CLASSIC_REGRESSION_RENDERER_POINTS_V2 = Object.freeze([
  Object.freeze([-0.35, 0.2] as const), Object.freeze([0.12, -0.28] as const),
  Object.freeze([0.43, 0.11] as const),
]);
export const JULIA_CLASSIC_REGRESSION_RENDERER_CONSTANTS_V2 = Object.freeze([
  Object.freeze([-0.7, 0.27] as const), Object.freeze([0.285, 0.01] as const),
  Object.freeze([-0.1542022, 0.6137691] as const),
]);
export const JULIA_CLASSIC_REGRESSION_RENDERER_INTEGRATION_WITNESS_FORMULA_ID_V2 =
  "015c5d9d-b9b1-5155-afa7-10a3f48c194a" as const;

export interface JuliaClassicRegressionRendererProfileV1 {
  readonly formulaId: string; readonly candidateRowReceipt: string;
  readonly sourceRevision: string; readonly semanticHash: string;
  readonly binding: OrbitConstantBindingV1; readonly bindingRevision: string;
  readonly supportLane: "source-split-direct" | "source-split-transitive";
  readonly parameters: Readonly<Record<string, number | string | readonly [number, number]>>;
  readonly view: Readonly<{ centerX: number; centerY: number; zoom: number; rotation: number }>;
  readonly iterations: 32;
}
export interface JuliaClassicRegressionRendererReportRowV1 {
  readonly formulaId: string; readonly candidateContentHash: string;
  readonly evaluatedSourceRevision: string; readonly evaluatedSemanticHash: string;
  readonly binding: OrbitConstantBindingV1; readonly bindingRevision: string;
  readonly supportLane: JuliaClassicRegressionRendererProfileV1["supportLane"];
  readonly profileDigest: string; readonly status: "passed" | "blocked";
  readonly reasonCode: string | null; readonly rendererClass: "SwiftShader-software";
  readonly fullFrameworkCompileLink: boolean; readonly fullFrameworkCappedDraw: boolean;
  readonly deterministicDoubleDraw: boolean; readonly traceOrbitSteps: number;
  readonly traceStateDimensions: number; readonly traceStateComparisons: number;
  readonly traceFlagComparisons: number; readonly imagePixelComparisons: number;
  readonly observedImageDifferingPixels: number; readonly observedMaximumRelativeError: number;
}
export function buildJuliaClassicRegressionRendererProfileV1(
  runtime: PublishedFormulaRuntimeIndexRowV1,
  row: Pick<JuliaClassicRegressionCorrectiveRowV1, "formulaId" | "rowReceipt" | "candidateSourceRevision" | "candidateSemanticHash" | "binding" | "correctiveBindingRevision" | "supportLane">,
): Readonly<{ profile: JuliaClassicRegressionRendererProfileV1; profileDigest: string }> {
  if (runtime.formulaId !== row.formulaId || row.binding.kind !== "source-split")
    throw new Error("julia-classic-regression-renderer-profile-v1-input-invalid");
  const parameters = Object.fromEntries(runtime.parameters.map((p) => [p.slotName,
    Array.isArray(p.default) ? Object.freeze([p.default[0], p.default[1]] as const) : p.default])) as JuliaClassicRegressionRendererProfileV1["parameters"];
  const profile: JuliaClassicRegressionRendererProfileV1 = Object.freeze({
    formulaId: row.formulaId, candidateRowReceipt: row.rowReceipt,
    sourceRevision: row.candidateSourceRevision, semanticHash: row.candidateSemanticHash,
    binding: Object.freeze({ ...row.binding }), bindingRevision: row.correctiveBindingRevision,
    supportLane: row.supportLane, parameters: Object.freeze(parameters),
    view: Object.freeze({ centerX: runtime.profile.center[0], centerY: runtime.profile.center[1], zoom: runtime.profile.zoom, rotation: runtime.profile.rotation }),
    iterations: 32,
  });
  return Object.freeze({ profile, profileDigest: sha256HexSyncV1(canonicalJsonV1(profile, 32768)) });
}
