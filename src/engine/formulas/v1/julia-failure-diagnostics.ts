import {
  JULIA_CPU_HARNESS_CONSTANTS_V1,
  JULIA_CPU_HARNESS_DEPTHS_V1,
  JULIA_CPU_HARNESS_POINTS_V1,
  type JuliaCpuHarnessReasonV1,
  type JuliaCpuHarnessV1,
  type JuliaCpuTraceV1,
} from "./julia-cpu-harness";

export const JULIA_FAILURE_DIAGNOSTIC_REVISION_V1 =
  "fractalpark-julia-failure-diagnostic/v1" as const;
export const JULIA_FAILURE_DIAGNOSTIC_EPSILON_V1 = 2 ** -20;
export const JULIA_FAILURE_DIAGNOSTIC_SOURCE_BINDING_PATHS_V1 = Object.freeze([
  "package-lock.json",
  "package.json",
  "public/formula-library/v1/runtime/published/index.json",
  "resources/formula-library/v1/julia-existing-system-c-evidence.v1.json",
  "resources/formula-library/v1/julia-pixel-recovery-candidates.v1.json",
  "resources/formula-library/v1/julia-pre-gpu-capability-census.v1.json",
  "resources/formula-library/v1/julia-renderer-evidence.v1.json",
  "resources/formula-library/v1/julia-source-split-evidence.v1.json",
  "scripts/diagnose-julia-cpu-renderer-failures.ts",
  "scripts/run-julia-compile-probe-worker.ts",
  "scripts/run-julia-failure-diagnostic-worker.ts",
  "scripts/verify-julia-failure-diagnostics.ts",
  "src/engine/formulas/v1/julia-binding.ts",
  "src/engine/formulas/v1/julia-cpu-harness.ts",
  "src/engine/formulas/v1/julia-failure-diagnostics.ts",
  "src/engine/formulas/v1/julia-pre-gpu-capability.ts",
  "src/engine/formulas/v1/julia-renderer-evidence.ts",
  "src/engine/formulas/v1/julia-source-split.ts",
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
  "src/engine/plugins/types.ts",
  "src/engine/shaders/assembler.ts",
  "src/engine/shaders/complex-math.glsl",
  "src/engine/shaders/framework.frag.glsl",
  "src/engine/shaders/palettes.glsl",
  "tsconfig.json",
] as const);

export type JuliaCpuTraceSetV1 =
  | "parameter-baseline"
  | "parameter-bound"
  | "julia";

export interface JuliaCpuFirstNonFiniteV1 {
  readonly traceSet: JuliaCpuTraceSetV1;
  readonly pointIndex: number;
  readonly constantIndex: number;
  readonly depthIndex: number;
  readonly requestedDepth: number;
  readonly completedSteps: number;
}

export interface JuliaCpuInsensitiveGroupV1 {
  readonly variedInput: "pixel" | "constant";
  readonly fixedPointIndex: number | null;
  readonly fixedConstantIndex: number | null;
  readonly depthIndex: number;
  readonly requestedDepth: number;
  readonly pairComparisonCount: number;
  readonly commonStateDifferenceCount: number;
  readonly eventOnlyDifferenceCount: number;
}

export interface JuliaCpuFailureProjectionV1 {
  readonly revision: typeof JULIA_FAILURE_DIAGNOSTIC_REVISION_V1;
  readonly reasonCodes: readonly JuliaCpuHarnessReasonV1[];
  readonly firstNonFinite: JuliaCpuFirstNonFiniteV1 | null;
  readonly firstPixelInsensitiveGroup: JuliaCpuInsensitiveGroupV1 | null;
  readonly firstConstantInsensitiveGroup: JuliaCpuInsensitiveGroupV1 | null;
}

export interface JuliaRendererFailureProjectionV1 {
  readonly surface:
    | "trace"
    | "image"
    | "image-constant-sensitivity"
    | "other";
  readonly mismatchKind: "state" | "flag" | "sensitivity" | "other";
  readonly plane: "parameter-plane" | "julia" | null;
  readonly pointIndex: number | null;
  readonly constantIndex: number | null;
  readonly depthIndex: number | null;
  readonly requestedDepth: number | null;
  readonly imagePixelIndex: number | null;
  readonly componentIndex: number | null;
  readonly rawFailureCode: string;
}

function pairDiffers(
  left: readonly [number, number],
  right: readonly [number, number],
): boolean {
  return !Object.is(left[0], right[0]) || !Object.is(left[1], right[1]);
}

function tracesHaveCommonStateDifference(
  left: JuliaCpuTraceV1,
  right: JuliaCpuTraceV1,
): boolean {
  const common = Math.min(left.orbit.length, right.orbit.length);
  for (let index = 0; index < common; index += 1)
    if (pairDiffers(left.orbit[index]!, right.orbit[index]!)) return true;
  return false;
}

function traceCoordinates(index: number): {
  pointIndex: number;
  constantIndex: number;
  depthIndex: number;
} {
  const depthCount = JULIA_CPU_HARNESS_DEPTHS_V1.length;
  const constantCount = JULIA_CPU_HARNESS_CONSTANTS_V1.length;
  const depthIndex = index % depthCount;
  const pointConstant = Math.floor(index / depthCount);
  return {
    pointIndex: Math.floor(pointConstant / constantCount),
    constantIndex: pointConstant % constantCount,
    depthIndex,
  };
}

function firstNonFiniteIn(
  traces: readonly JuliaCpuTraceV1[],
  traceSet: JuliaCpuTraceSetV1,
): JuliaCpuFirstNonFiniteV1 | null {
  const index = traces.findIndex((trace) => trace.event === "nonFinite");
  if (index < 0) return null;
  const coordinates = traceCoordinates(index);
  const trace = traces[index]!;
  return Object.freeze({
    traceSet,
    ...coordinates,
    requestedDepth: trace.requestedDepth,
    completedSteps: trace.completedSteps,
  });
}

function juliaTraces(harness: JuliaCpuHarnessV1): readonly JuliaCpuTraceV1[] {
  const gridSize =
    JULIA_CPU_HARNESS_POINTS_V1.length *
    JULIA_CPU_HARNESS_CONSTANTS_V1.length *
    JULIA_CPU_HARNESS_DEPTHS_V1.length;
  return harness.traces.slice(gridSize, gridSize * 2);
}

function traceAt(
  traces: readonly JuliaCpuTraceV1[],
  pointIndex: number,
  constantIndex: number,
  depthIndex: number,
): JuliaCpuTraceV1 {
  const index =
    (pointIndex * JULIA_CPU_HARNESS_CONSTANTS_V1.length + constantIndex) *
      JULIA_CPU_HARNESS_DEPTHS_V1.length +
    depthIndex;
  return traces[index]!;
}

function inspectGroup(
  traces: readonly JuliaCpuTraceV1[],
  variedInput: "pixel" | "constant",
  fixedIndex: number,
  depthIndex: number,
): JuliaCpuInsensitiveGroupV1 | null {
  const variationCount =
    variedInput === "pixel"
      ? JULIA_CPU_HARNESS_POINTS_V1.length
      : JULIA_CPU_HARNESS_CONSTANTS_V1.length;
  let pairComparisonCount = 0;
  let commonStateDifferenceCount = 0;
  let eventOnlyDifferenceCount = 0;
  for (let left = 0; left < variationCount; left += 1) {
    for (let right = left + 1; right < variationCount; right += 1) {
      const leftTrace =
        variedInput === "pixel"
          ? traceAt(traces, left, fixedIndex, depthIndex)
          : traceAt(traces, fixedIndex, left, depthIndex);
      const rightTrace =
        variedInput === "pixel"
          ? traceAt(traces, right, fixedIndex, depthIndex)
          : traceAt(traces, fixedIndex, right, depthIndex);
      pairComparisonCount += 1;
      const stateDifference = tracesHaveCommonStateDifference(
        leftTrace,
        rightTrace,
      );
      if (stateDifference) commonStateDifferenceCount += 1;
      else if (
        leftTrace.event !== rightTrace.event ||
        leftTrace.completedSteps !== rightTrace.completedSteps
      )
        eventOnlyDifferenceCount += 1;
    }
  }
  if (commonStateDifferenceCount > 0) return null;
  return Object.freeze({
    variedInput,
    fixedPointIndex: variedInput === "constant" ? fixedIndex : null,
    fixedConstantIndex: variedInput === "pixel" ? fixedIndex : null,
    depthIndex,
    requestedDepth: JULIA_CPU_HARNESS_DEPTHS_V1[depthIndex]!,
    pairComparisonCount,
    commonStateDifferenceCount,
    eventOnlyDifferenceCount,
  });
}

function firstInsensitiveGroup(
  traces: readonly JuliaCpuTraceV1[],
  variedInput: "pixel" | "constant",
): JuliaCpuInsensitiveGroupV1 | null {
  const fixedCount =
    variedInput === "pixel"
      ? JULIA_CPU_HARNESS_CONSTANTS_V1.length
      : JULIA_CPU_HARNESS_POINTS_V1.length;
  for (let fixedIndex = 0; fixedIndex < fixedCount; fixedIndex += 1)
    for (
      let depthIndex = 0;
      depthIndex < JULIA_CPU_HARNESS_DEPTHS_V1.length;
      depthIndex += 1
    ) {
      const result = inspectGroup(
        traces,
        variedInput,
        fixedIndex,
        depthIndex,
      );
      if (result) return result;
    }
  return null;
}

export function projectJuliaCpuFailureV1(
  harness: JuliaCpuHarnessV1,
): JuliaCpuFailureProjectionV1 {
  const gridSize =
    JULIA_CPU_HARNESS_POINTS_V1.length *
    JULIA_CPU_HARNESS_CONSTANTS_V1.length *
    JULIA_CPU_HARNESS_DEPTHS_V1.length;
  const parameterBound = harness.traces.slice(0, gridSize);
  const julia = juliaTraces(harness);
  const firstNonFinite =
    firstNonFiniteIn(
      harness.parameterPlaneBaselineTraces,
      "parameter-baseline",
    ) ??
    firstNonFiniteIn(parameterBound, "parameter-bound") ??
    firstNonFiniteIn(julia, "julia");
  return Object.freeze({
    revision: JULIA_FAILURE_DIAGNOSTIC_REVISION_V1,
    reasonCodes: Object.freeze([...harness.reasonCodes]),
    firstNonFinite,
    firstPixelInsensitiveGroup: harness.reasonCodes.includes(
      "pixel-insensitive",
    )
      ? firstInsensitiveGroup(julia, "pixel")
      : null,
    firstConstantInsensitiveGroup: harness.reasonCodes.includes(
      "constant-insensitive",
    )
      ? firstInsensitiveGroup(julia, "constant")
      : null,
  });
}

export function projectJuliaRendererFailureV1(
  failureCode: string,
): JuliaRendererFailureProjectionV1 {
  const trace = /^(trace-state-mismatch|trace-flag-mismatch):(\d+)$/.exec(
    failureCode,
  );
  if (trace) {
    const valueIndex = Number(trace[2]);
    const componentIndex = valueIndex % 4;
    const pixelIndex = Math.floor(valueIndex / 4);
    const depthIndex = pixelIndex % 8;
    const rowIndex = Math.floor(pixelIndex / 8);
    const parameterPlane = rowIndex < 3;
    const combination = parameterPlane ? rowIndex : rowIndex - 3;
    return Object.freeze({
      surface: "trace",
      mismatchKind: trace[1] === "trace-state-mismatch" ? "state" : "flag",
      plane: parameterPlane ? "parameter-plane" : "julia",
      pointIndex: parameterPlane ? combination : Math.floor(combination / 3),
      constantIndex: parameterPlane ? null : combination % 3,
      depthIndex,
      requestedDepth: JULIA_CPU_HARNESS_DEPTHS_V1[depthIndex]!,
      imagePixelIndex: null,
      componentIndex,
      rawFailureCode: failureCode,
    });
  }
  const image = /^(image-state-mismatch|image-flag-mismatch):([AB]):(\d+)$/.exec(
    failureCode,
  );
  if (image) {
    const valueIndex = Number(image[3]);
    return Object.freeze({
      surface: "image",
      mismatchKind: image[1] === "image-state-mismatch" ? "state" : "flag",
      plane: "julia",
      pointIndex: null,
      constantIndex: image[2] === "A" ? 0 : 1,
      depthIndex: null,
      requestedDepth: null,
      imagePixelIndex: Math.floor(valueIndex / 4),
      componentIndex: valueIndex % 4,
      rawFailureCode: failureCode,
    });
  }
  if (failureCode === "image-constant-insensitive")
    return Object.freeze({
      surface: "image-constant-sensitivity",
      mismatchKind: "sensitivity",
      plane: "julia",
      pointIndex: null,
      constantIndex: null,
      depthIndex: null,
      requestedDepth: null,
      imagePixelIndex: null,
      componentIndex: null,
      rawFailureCode: failureCode,
    });
  return Object.freeze({
    surface: "other",
    mismatchKind: "other",
    plane: null,
    pointIndex: null,
    constantIndex: null,
    depthIndex: null,
    requestedDepth: null,
    imagePixelIndex: null,
    componentIndex: null,
    rawFailureCode: failureCode,
  });
}
