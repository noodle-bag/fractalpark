import type { FrmLikeV1Ir } from "../../frm/v1";
import type { FrmV1UnaryFunctionName } from "../../frm/frm-v1-stdlib";
import {
  compileFrmLikeV1Backend,
  type FrmLikeV1Backend,
  type FrmLikeV1CpuState,
} from "../../frm/v1-backend";
import {
  classifyJuliaBindingRolesV1,
  parseJuliaSourceBindingV1,
  type JuliaBindingContractV1,
  type JuliaSourceBindingV1,
  type OrbitConstantBindingV1,
} from "./julia-binding";

export const JULIA_CPU_HARNESS_POINTS_V1 = Object.freeze([
  Object.freeze([-0.35, 0.2] as const),
  Object.freeze([0.12, -0.28] as const),
  Object.freeze([0.43, 0.11] as const),
]);
export const JULIA_CPU_HARNESS_CONSTANTS_V1 = Object.freeze([
  Object.freeze([-0.7, 0.27] as const),
  Object.freeze([0.285, 0.01] as const),
  Object.freeze([-0.1542022, 0.6137691] as const),
]);
export const JULIA_CPU_HARNESS_DEPTHS_V1 = Object.freeze([
  1, 2, 4, 8, 16, 32, 64, 128,
] as const);

export type JuliaCpuComplexV1 = readonly [number, number];
export type JuliaCpuTerminalEventV1 = "bounded" | "escaped" | "nonFinite";

export interface JuliaCpuTraceV1 {
  readonly pixel: JuliaCpuComplexV1;
  readonly juliaC: JuliaCpuComplexV1;
  readonly mode: "parameter-plane" | "julia";
  readonly requestedDepth: number;
  readonly completedSteps: number;
  readonly event: JuliaCpuTerminalEventV1;
  readonly orbit: readonly JuliaCpuComplexV1[];
}

export interface JuliaCpuHarnessV1 {
  readonly schema: "fractalpark-julia-cpu-harness/v1";
  readonly evidenceClass: "tier1-candidate-only";
  readonly contract: JuliaBindingContractV1;
  readonly points: readonly JuliaCpuComplexV1[];
  readonly constants: readonly JuliaCpuComplexV1[];
  readonly depths: readonly number[];
  readonly parameterPlaneBaselineTraces: readonly JuliaCpuTraceV1[];
  readonly traces: readonly JuliaCpuTraceV1[];
  readonly checks: Readonly<{
    parameterPlaneBitIdentical: boolean;
    deterministic: boolean;
    finiteEvidence: boolean;
    pixelSensitive: boolean;
    constantSensitive: boolean;
  }>;
  readonly candidatePass: boolean;
  readonly reasonCodes: readonly JuliaCpuHarnessReasonV1[];
}

export type JuliaCpuHarnessReasonV1 =
  | "backend-failed"
  | "static-classifier-failed"
  | "invalid-probe-grid"
  | "source-split-baseline-required"
  | "source-split-baseline-invalid"
  | "runtime-failed"
  | "parameter-plane-drift"
  | "nondeterministic"
  | "non-finite-evidence"
  | "pixel-insensitive"
  | "constant-insensitive";

export type JuliaCpuHarnessResultV1 =
  | { readonly ok: true; readonly value: JuliaCpuHarnessV1 }
  | { readonly ok: false; readonly reasonCode: JuliaCpuHarnessReasonV1 };

export interface JuliaCpuHarnessOptionsV1 {
  readonly sourceBinding?: JuliaSourceBindingV1;
  readonly parameterPlaneBaseline?: JuliaSourceBindingV1;
  readonly points?: readonly JuliaCpuComplexV1[];
  readonly constants?: readonly JuliaCpuComplexV1[];
  readonly depths?: readonly number[];
  readonly parameters?: Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>>;
}

function finitePair(value: JuliaCpuComplexV1): boolean {
  return value.length === 2 && value.every(Number.isFinite);
}

function freezePair(value: JuliaCpuComplexV1): JuliaCpuComplexV1 {
  return Object.freeze([value[0], value[1]] as const);
}

function pairKey(value: JuliaCpuComplexV1): string {
  return `${Object.is(value[0], -0) ? 0 : value[0]},${Object.is(value[1], -0) ? 0 : value[1]}`;
}

function validGrid(
  points: readonly JuliaCpuComplexV1[],
  constants: readonly JuliaCpuComplexV1[],
  depths: readonly number[],
): boolean {
  return (
    points.length >= 3 &&
    constants.length >= 3 &&
    depths.length >= 3 &&
    points.every(finitePair) &&
    constants.every(finitePair) &&
    new Set(points.map(pairKey)).size === points.length &&
    new Set(constants.map(pairKey)).size === constants.length &&
    depths.every((depth) => Number.isSafeInteger(depth) && depth > 0 && depth <= 256) &&
    new Set(depths).size === depths.length &&
    depths.every((depth, index) => index === 0 || depths[index - 1]! < depth)
  );
}

function frozenParameters(
  parameters: JuliaCpuHarnessOptionsV1["parameters"],
): Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>> {
  const result: Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName> = {};
  for (const [key, value] of Object.entries(parameters ?? {}))
    result[key] = Array.isArray(value)
      ? freezePair(value as JuliaCpuComplexV1)
      : (value as number | FrmV1UnaryFunctionName);
  return Object.freeze(result);
}

function runtimeParameters(
  base: Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>>,
  binding: OrbitConstantBindingV1,
  juliaC: JuliaCpuComplexV1,
  mode: "parameter-plane" | "julia",
): Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>> {
  if (mode !== "julia" || binding.kind !== "parameter") return base;
  return Object.freeze({ ...base, [binding.slotName]: freezePair(juliaC) });
}

function zPair(state: FrmLikeV1CpuState): JuliaCpuComplexV1 | undefined {
  const value = state.values.z;
  if (!value || !Number.isFinite(value.re) || !Number.isFinite(value.im)) return undefined;
  return freezePair([value.re, value.im]);
}

function runTrace(
  backend: FrmLikeV1Backend,
  binding: OrbitConstantBindingV1,
  pixel: JuliaCpuComplexV1,
  juliaC: JuliaCpuComplexV1,
  mode: "parameter-plane" | "julia",
  depth: number,
  parameters: Readonly<Record<string, number | JuliaCpuComplexV1 | FrmV1UnaryFunctionName>>,
): JuliaCpuTraceV1 {
  const state = backend.cpu.createState({
    pixel: { re: pixel[0], im: pixel[1] },
    c:
      mode === "julia" &&
      (binding.kind === "system-c" || binding.kind === "source-split")
        ? { re: juliaC[0], im: juliaC[1] }
        : { re: pixel[0], im: pixel[1] },
    ismand: mode === "parameter-plane",
    maxit: depth,
    parameters: runtimeParameters(parameters, binding, juliaC, mode),
  });
  const init = backend.cpu.init(state);
  const orbit: JuliaCpuComplexV1[] = [];
  let event: JuliaCpuTerminalEventV1 = init.event === "nonFinite" ? "nonFinite" : "bounded";
  if (event !== "nonFinite") {
    for (let step = 1; step <= depth; step++) {
      const stepped = backend.cpu.step(state);
      if (stepped.event === "nonFinite") {
        event = "nonFinite";
        break;
      }
      const z = zPair(state);
      if (!z) {
        event = "nonFinite";
        break;
      }
      orbit.push(z);
      const continuation = backend.cpu.shouldContinue(state);
      if (continuation.event === "nonFinite") {
        event = "nonFinite";
        break;
      }
      if (continuation.continue === false) {
        event = "escaped";
        break;
      }
    }
  }
  return Object.freeze({
    pixel: freezePair(pixel),
    juliaC: freezePair(juliaC),
    mode,
    requestedDepth: depth,
    completedSteps: orbit.length,
    event,
    orbit: Object.freeze(orbit),
  });
}

function exactPairEqual(
  left: JuliaCpuComplexV1,
  right: JuliaCpuComplexV1,
): boolean {
  return Object.is(left[0], right[0]) && Object.is(left[1], right[1]);
}

function exactTraceEqual(left: JuliaCpuTraceV1, right: JuliaCpuTraceV1): boolean {
  return (
    exactPairEqual(left.pixel, right.pixel) &&
    exactPairEqual(left.juliaC, right.juliaC) &&
    left.mode === right.mode &&
    left.requestedDepth === right.requestedDepth &&
    left.completedSteps === right.completedSteps &&
    left.event === right.event &&
    left.orbit.length === right.orbit.length &&
    left.orbit.every((value, index) =>
      exactPairEqual(value, right.orbit[index]!),
    )
  );
}

export function exactJuliaCpuTraceSetsEqualV1(
  left: readonly JuliaCpuTraceV1[],
  right: readonly JuliaCpuTraceV1[],
): boolean {
  return (
    left.length === right.length &&
    left.every((trace, index) => exactTraceEqual(trace, right[index]!))
  );
}

function finiteOrbitDifference(
  left: JuliaCpuTraceV1,
  right: JuliaCpuTraceV1,
): boolean {
  if (
    left.event === "nonFinite" ||
    right.event === "nonFinite" ||
    left.orbit.length === 0 ||
    right.orbit.length === 0
  )
    return false;
  const commonLength = Math.min(left.orbit.length, right.orbit.length);
  for (let index = 0; index < commonLength; index++)
    if (pairKey(left.orbit[index]!) !== pairKey(right.orbit[index]!)) return true;
  return false;
}

function sensitivity(
  traces: readonly JuliaCpuTraceV1[],
  fixedKey: (trace: JuliaCpuTraceV1) => string,
  variedKey: (trace: JuliaCpuTraceV1) => string,
): boolean {
  const groups = new Map<string, Map<string, JuliaCpuTraceV1[]>>();
  for (const trace of traces) {
    const fixed = fixedKey(trace);
    const varied = variedKey(trace);
    const byVariation = groups.get(fixed) ?? new Map<string, JuliaCpuTraceV1[]>();
    const values = byVariation.get(varied) ?? [];
    values.push(trace);
    byVariation.set(varied, values);
    groups.set(fixed, byVariation);
  }
  if (groups.size === 0) return false;
  return [...groups.values()].every((byVariation) => {
    const variations = [...byVariation.values()];
    if (variations.length < 2) return false;
    for (let left = 0; left < variations.length; left++)
      for (let right = left + 1; right < variations.length; right++)
        for (const leftTrace of variations[left]!)
          for (const rightTrace of variations[right]!)
            if (finiteOrbitDifference(leftTrace, rightTrace)) return true;
    return false;
  });
}

export function runJuliaCpuHarnessV1(
  ir: FrmLikeV1Ir,
  binding: OrbitConstantBindingV1,
  options: JuliaCpuHarnessOptionsV1 = {},
): JuliaCpuHarnessResultV1 {
  const classified = classifyJuliaBindingRolesV1(
    ir,
    binding,
    options.sourceBinding,
  );
  if (!classified.ok)
    return { ok: false, reasonCode: "static-classifier-failed" };
  if (binding.kind === "source-split" && !options.parameterPlaneBaseline)
    return { ok: false, reasonCode: "source-split-baseline-required" };
  const parsedBaseline =
    binding.kind === "source-split"
      ? parseJuliaSourceBindingV1(options.parameterPlaneBaseline)
      : undefined;
  if (
    binding.kind === "source-split" &&
    (!parsedBaseline?.ok ||
      parsedBaseline.sourceRevision === binding.sourceRevision)
  )
    return { ok: false, reasonCode: "source-split-baseline-invalid" };
  const compiled = compileFrmLikeV1Backend(ir);
  const baselineCompiled = compileFrmLikeV1Backend(
    parsedBaseline?.ok ? parsedBaseline.ir : ir,
  );
  if (!compiled.ok || !baselineCompiled.ok)
    return { ok: false, reasonCode: "backend-failed" };

  const points = (options.points ?? JULIA_CPU_HARNESS_POINTS_V1).map(freezePair);
  const constants = (options.constants ?? JULIA_CPU_HARNESS_CONSTANTS_V1).map(freezePair);
  const depths = [...(options.depths ?? JULIA_CPU_HARNESS_DEPTHS_V1)];
  if (!validGrid(points, constants, depths))
    return { ok: false, reasonCode: "invalid-probe-grid" };
  const parameters = frozenParameters(options.parameters);

  const parameterPlaneBaseline: JuliaCpuTraceV1[] = [];
  const parameterPlaneBound: JuliaCpuTraceV1[] = [];
  const julia: JuliaCpuTraceV1[] = [];
  try {
    for (const pixel of points) {
    for (const juliaC of constants) {
      for (const depth of depths) {
        parameterPlaneBaseline.push(
          runTrace(
            baselineCompiled.backend,
            { kind: "none" },
            pixel,
            juliaC,
            "parameter-plane",
            depth,
            parameters,
          ),
        );
        parameterPlaneBound.push(
          runTrace(
            compiled.backend,
            binding,
            pixel,
            juliaC,
            "parameter-plane",
            depth,
            parameters,
          ),
        );
        julia.push(
          runTrace(
            compiled.backend,
            binding,
            pixel,
            juliaC,
            "julia",
            depth,
            parameters,
          ),
        );
      }
    }
  }
  } catch {
    return { ok: false, reasonCode: "runtime-failed" };
  }
  let juliaRepeat: JuliaCpuTraceV1[];
  try {
    juliaRepeat = julia.map((trace) =>
    runTrace(
      compiled.backend,
      binding,
      trace.pixel,
      trace.juliaC,
      "julia",
      trace.requestedDepth,
      parameters,
    ),
  );
  } catch {
    return { ok: false, reasonCode: "runtime-failed" };
  }

  const checks = Object.freeze({
    parameterPlaneBitIdentical: exactJuliaCpuTraceSetsEqualV1(
      parameterPlaneBaseline,
      parameterPlaneBound,
    ),
    deterministic: exactJuliaCpuTraceSetsEqualV1(julia, juliaRepeat),
    finiteEvidence: [
      ...parameterPlaneBaseline,
      ...parameterPlaneBound,
      ...julia,
    ].every((trace) => trace.event !== "nonFinite" && trace.orbit.length > 0),
    pixelSensitive: sensitivity(
      julia,
      (trace) => `${pairKey(trace.juliaC)}@${trace.requestedDepth}`,
      (trace) => pairKey(trace.pixel),
    ),
    constantSensitive: sensitivity(
      julia,
      (trace) => `${pairKey(trace.pixel)}@${trace.requestedDepth}`,
      (trace) => pairKey(trace.juliaC),
    ),
  });
  const reasonCodes: JuliaCpuHarnessReasonV1[] = [];
  if (!checks.parameterPlaneBitIdentical) reasonCodes.push("parameter-plane-drift");
  if (!checks.deterministic) reasonCodes.push("nondeterministic");
  if (!checks.finiteEvidence) reasonCodes.push("non-finite-evidence");
  if (!checks.pixelSensitive) reasonCodes.push("pixel-insensitive");
  if (!checks.constantSensitive) reasonCodes.push("constant-insensitive");

  return {
    ok: true,
    value: Object.freeze({
      schema: "fractalpark-julia-cpu-harness/v1",
      evidenceClass: "tier1-candidate-only",
      contract: Object.freeze({
        ...classified.contract,
        invariant: checks.parameterPlaneBitIdentical
          ? "parameter-plane-bit-identical"
          : "semantic-extension",
      }),
      points: Object.freeze(points),
      constants: Object.freeze(constants),
      depths: Object.freeze(depths),
      parameterPlaneBaselineTraces: Object.freeze(parameterPlaneBaseline),
      traces: Object.freeze([...parameterPlaneBound, ...julia]),
      checks,
      candidatePass: reasonCodes.length === 0,
      reasonCodes: Object.freeze(reasonCodes),
    }),
  };
}
