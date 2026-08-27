import { describe, expect, it } from "vitest";
import {
  JULIA_CPU_HARNESS_CONSTANTS_V1,
  JULIA_CPU_HARNESS_DEPTHS_V1,
  JULIA_CPU_HARNESS_POINTS_V1,
  type JuliaCpuHarnessV1,
  type JuliaCpuTraceV1,
} from "../engine/formulas/v1/julia-cpu-harness";
import {
  projectJuliaCpuFailureV1,
  projectJuliaRendererFailureV1,
} from "../engine/formulas/v1/julia-failure-diagnostics";

function trace(index: number, mode: "parameter-plane" | "julia"): JuliaCpuTraceV1 {
  const depthIndex = index % JULIA_CPU_HARNESS_DEPTHS_V1.length;
  const pointConstant = Math.floor(
    index / JULIA_CPU_HARNESS_DEPTHS_V1.length,
  );
  const pointIndex = Math.floor(
    pointConstant / JULIA_CPU_HARNESS_CONSTANTS_V1.length,
  );
  const constantIndex =
    pointConstant % JULIA_CPU_HARNESS_CONSTANTS_V1.length;
  return {
    pixel: JULIA_CPU_HARNESS_POINTS_V1[pointIndex]!,
    juliaC: JULIA_CPU_HARNESS_CONSTANTS_V1[constantIndex]!,
    mode,
    requestedDepth: JULIA_CPU_HARNESS_DEPTHS_V1[depthIndex]!,
    completedSteps: 1,
    event: "bounded",
    orbit: [[0, 0]],
  };
}

function insensitiveHarness(): JuliaCpuHarnessV1 {
  const gridSize =
    JULIA_CPU_HARNESS_POINTS_V1.length *
    JULIA_CPU_HARNESS_CONSTANTS_V1.length *
    JULIA_CPU_HARNESS_DEPTHS_V1.length;
  const baseline = Array.from({ length: gridSize }, (_, index) =>
    trace(index, "parameter-plane"),
  );
  baseline[0] = { ...baseline[0]!, event: "nonFinite", orbit: [] };
  const parameter = Array.from({ length: gridSize }, (_, index) =>
    trace(index, "parameter-plane"),
  );
  const julia = Array.from({ length: gridSize }, (_, index) =>
    trace(index, "julia"),
  );
  const signedZeroIndex =
    (1 * JULIA_CPU_HARNESS_CONSTANTS_V1.length + 0) *
    JULIA_CPU_HARNESS_DEPTHS_V1.length;
  julia[signedZeroIndex] = {
    ...julia[signedZeroIndex]!,
    orbit: [[-0, 0]],
  };
  return {
    schema: "fractalpark-julia-cpu-harness/v1",
    evidenceClass: "tier1-candidate-only",
    contract: {
      binding: { kind: "system-c" },
      z0Role: "pixel-seed",
      modeClass: "classic-julia",
      supportLane: "existing-system-c",
      invariant: "parameter-plane-bit-identical",
    },
    points: JULIA_CPU_HARNESS_POINTS_V1,
    constants: JULIA_CPU_HARNESS_CONSTANTS_V1,
    depths: JULIA_CPU_HARNESS_DEPTHS_V1,
    parameterPlaneBaselineTraces: baseline,
    traces: [...parameter, ...julia],
    checks: {
      parameterPlaneBitIdentical: true,
      deterministic: true,
      finiteEvidence: false,
      pixelSensitive: false,
      constantSensitive: false,
    },
    candidatePass: false,
    reasonCodes: [
      "non-finite-evidence",
      "pixel-insensitive",
      "constant-insensitive",
    ],
  };
}

describe("Julia failure diagnostic projections", () => {
  it("decodes trace and labeled image first-failure positions", () => {
    expect(projectJuliaRendererFailureV1("trace-state-mismatch:104")).toMatchObject({
      surface: "trace",
      mismatchKind: "state",
      plane: "julia",
      pointIndex: 0,
      constantIndex: 0,
      depthIndex: 2,
      requestedDepth: 4,
      componentIndex: 0,
    });
    expect(projectJuliaRendererFailureV1("trace-flag-mismatch:63")).toMatchObject({
      plane: "parameter-plane",
      pointIndex: 1,
      constantIndex: null,
      depthIndex: 7,
      requestedDepth: 128,
      componentIndex: 3,
    });
    expect(projectJuliaRendererFailureV1("image-state-mismatch:B:92")).toMatchObject({
      surface: "image",
      mismatchKind: "state",
      plane: "julia",
      constantIndex: 1,
      imagePixelIndex: 23,
      componentIndex: 0,
    });
  });

  it("finds non-finite and insensitive groups without event-only leakage", () => {
    const projected = projectJuliaCpuFailureV1(insensitiveHarness());
    expect(projected.firstNonFinite).toEqual({
      traceSet: "parameter-baseline",
      pointIndex: 0,
      constantIndex: 0,
      depthIndex: 0,
      requestedDepth: 1,
      completedSteps: 1,
    });
    expect(projected.firstPixelInsensitiveGroup).toMatchObject({
      variedInput: "pixel",
      fixedConstantIndex: 0,
      depthIndex: 1,
      requestedDepth: 2,
      pairComparisonCount: 3,
      commonStateDifferenceCount: 0,
    });
    expect(projected.firstConstantInsensitiveGroup).toMatchObject({
      variedInput: "constant",
      fixedPointIndex: 0,
      depthIndex: 0,
      pairComparisonCount: 3,
      commonStateDifferenceCount: 0,
    });
  });
});
