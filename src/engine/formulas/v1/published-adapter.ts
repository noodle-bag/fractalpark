import {
  hashFrmLikeV1,
  parseFrmLikeV1,
  type FrmLikeV1Ir,
  type FrmLikeV1Parameter,
} from "@/engine/frm/v1";
import {
  compileFrmLikeV1Backend,
  type FrmLikeV1Backend,
} from "@/engine/frm/v1-backend";
import { FRM_V1_UNARY_FUNCTION_NAMES } from "@/engine/frm/frm-v1-stdlib";
import type {
  FormulaPlugin,
  PluginUniformDescriptor,
} from "@/engine/plugins/types";
import { resolveJuliaCapabilityV1 } from "./julia-capability";

const SHA256 = /^[a-f0-9]{64}$/;
const GLSL_PREFIX = "frmV1_";

export const PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1 =
  "fractalpark-published-formula-descriptor/v1" as const;

export interface PublishedFormulaParameterDescriptorV1 {
  readonly slotName: string;
  readonly type: "real" | "complex" | "function";
  readonly default: number | readonly [number, number] | string;
  readonly hardDomain?: readonly [number, number];
  readonly classicBinding?: string;
  readonly uniformName: string;
  readonly options?: readonly string[];
}

export interface PublishedFormulaDescriptorV1 {
  readonly schema: typeof PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1;
  readonly formulaId: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly parameters: readonly PublishedFormulaParameterDescriptorV1[];
}

export interface PublishedFormulaPluginArtifactV1 {
  readonly plugin: FormulaPlugin;
  readonly descriptor: PublishedFormulaDescriptorV1;
  readonly backend: FrmLikeV1Backend;
}

export type PublishedFormulaPluginCompileResultV1 =
  | { readonly ok: true; readonly value: PublishedFormulaPluginArtifactV1 }
  | {
      readonly ok: false;
      readonly code:
        | "invalid-input"
        | "definition-invalid"
        | "source-revision-mismatch"
        | "semantic-hash-mismatch"
        | "backend-failed"
        | "function-default-invalid";
    };

export interface PublishedFormulaPluginInputV1 {
  readonly formulaId: string;
  readonly displayName: string;
  readonly family: string;
  readonly sourceRevision: string;
  readonly semanticHash: string;
  readonly source: string;
}

function glslName(name: string): string {
  return `${GLSL_PREFIX}${name}`;
}

function parameterDescriptor(
  parameter: FrmLikeV1Parameter,
): PublishedFormulaParameterDescriptorV1 | undefined {
  const base = {
    slotName: parameter.name,
    type: parameter.type,
    default: parameter.default,
    ...(parameter.hardDomain ? { hardDomain: parameter.hardDomain } : {}),
    ...(parameter.classicBinding
      ? { classicBinding: parameter.classicBinding }
      : {}),
  };
  if (parameter.type === "function") {
    if (
      typeof parameter.default !== "string" ||
      !FRM_V1_UNARY_FUNCTION_NAMES.includes(
        parameter.default as (typeof FRM_V1_UNARY_FUNCTION_NAMES)[number],
      )
    )
      return undefined;
    return Object.freeze({
      ...base,
      uniformName: `u_frm_${parameter.name}`,
      options: Object.freeze([...FRM_V1_UNARY_FUNCTION_NAMES]),
    });
  }
  return Object.freeze({
    ...base,
    uniformName: glslName(parameter.name),
  });
}

function pluginUniform(
  parameter: PublishedFormulaParameterDescriptorV1,
): PluginUniformDescriptor {
  if (parameter.type === "function") {
    const index = FRM_V1_UNARY_FUNCTION_NAMES.indexOf(
      parameter.default as (typeof FRM_V1_UNARY_FUNCTION_NAMES)[number],
    );
    return {
      name: parameter.uniformName,
      type: "int",
      default: index,
      min: 0,
      max: FRM_V1_UNARY_FUNCTION_NAMES.length - 1,
      step: 1,
    };
  }
  const value =
    parameter.type === "real"
      ? [parameter.default as number, 0]
      : [...(parameter.default as readonly [number, number])];
  return {
    name: parameter.uniformName,
    type: "vec2",
    default: value,
    ...(parameter.hardDomain
      ? { min: parameter.hardDomain[0], max: parameter.hardDomain[1] }
      : {}),
  };
}

function resetStateGlsl(ir: FrmLikeV1Ir): string {
  const resetLocals = ir.locals.map((local) =>
    local.type === "boolean"
      ? `  ${glslName(local.name)} = false;`
      : `  ${glslName(local.name)} = vec2(0.0);`,
  );
  return [
    "void frmV1ResetState(vec2 point, vec2 orbitC, int maxIterations, bool parameterPlane) {",
    "  frmV1NonFiniteEvent = false;",
    `  ${glslName("pixel")} = point;`,
    `  ${glslName("c")} = orbitC;`,
    `  ${glslName("maxit")} = vec2(float(maxIterations), 0.0);`,
    `  ${glslName("ismand")} = parameterPlane;`,
    `  ${glslName("z")} = vec2(0.0);`,
    `  ${glslName("zPrev")} = vec2(0.0);`,
    `  ${glslName("LastSqr")} = vec2(0.0);`,
    ...resetLocals,
    "}",
  ].join("\n");
}

function orbitFunctionsGlsl(
  backend: FrmLikeV1Backend,
  ir: FrmLikeV1Ir,
): string {
  return [
    resetStateGlsl(ir),
    "vec2 initFormula(vec2 currentZ, vec2 orbitC, vec2 point) {",
    // The CPU backend starts z at zero. Definitions that want the incoming
    // Julia point explicitly assign pixel in their init block.
    `  ${glslName("z")} = vec2(0.0);`,
    `  ${glslName("c")} = orbitC;`,
    `  ${glslName("pixel")} = point;`,
    backend.glsl.init,
    `  return ${glslName("z")};`,
    "}",
    "vec2 iterateStep(vec2 currentZ, vec2 orbitC, vec2 currentZPrev, vec2 point) {",
    `  ${glslName("z")} = currentZ;`,
    `  ${glslName("c")} = orbitC;`,
    `  ${glslName("pixel")} = point;`,
    backend.glsl.loop,
    `  return ${glslName("z")};`,
    "}",
    "bool frmV1ShouldContinue() {",
    `  return ${backend.glsl.continuePredicate};`,
    "}",
    "bool frmV1HasEvent() {",
    "  return frmV1NonFiniteEvent;",
    "}",
  ].join("\n");
}

export async function compilePublishedFormulaPluginV1(
  input: PublishedFormulaPluginInputV1,
): Promise<PublishedFormulaPluginCompileResultV1> {
  if (
    input.formulaId.length === 0 ||
    input.displayName.length === 0 ||
    input.family.length === 0 ||
    !SHA256.test(input.sourceRevision) ||
    !SHA256.test(input.semanticHash) ||
    input.source.length === 0
  )
    return { ok: false, code: "invalid-input" };

  const parsed = parseFrmLikeV1(input.source);
  if (!parsed.ok) return { ok: false, code: "definition-invalid" };
  const revisions = await hashFrmLikeV1(input.source, parsed.ir);
  if (revisions.sourceRevision !== input.sourceRevision)
    return { ok: false, code: "source-revision-mismatch" };
  if (revisions.semanticHash !== input.semanticHash)
    return { ok: false, code: "semantic-hash-mismatch" };

  const backend = compileFrmLikeV1Backend(parsed.ir, {
    glsl: { identifierPrefix: GLSL_PREFIX, orbitPlugin: true },
  });
  if (!backend.ok) return { ok: false, code: "backend-failed" };

  const parameters: PublishedFormulaParameterDescriptorV1[] = [];
  for (const parameter of parsed.ir.parameters) {
    const descriptor = parameterDescriptor(parameter);
    if (!descriptor) return { ok: false, code: "function-default-invalid" };
    parameters.push(descriptor);
  }
  const frozenParameters = Object.freeze(parameters);
  const descriptor: PublishedFormulaDescriptorV1 = Object.freeze({
    schema: PUBLISHED_FORMULA_DESCRIPTOR_SCHEMA_V1,
    formulaId: input.formulaId,
    sourceRevision: input.sourceRevision,
    semanticHash: input.semanticHash,
    parameters: frozenParameters,
  });
  const plugin: FormulaPlugin = Object.freeze({
    id: input.formulaId,
    category: "formula",
    name: input.displayName,
    family: input.family,
    source: "frm",
    glsl: `${backend.backend.glsl.declarations}\n${orbitFunctionsGlsl(
      backend.backend,
      parsed.ir,
    )}`,
    uniforms: frozenParameters.map(pluginUniform),
    bailout: 4,
    supportsPower: false,
    supportsJulia: resolveJuliaCapabilityV1(
      input.formulaId,
      input.sourceRevision,
    ).supportsEditing,
    afterStepTiming: true,
    smoothCapability: "unavailable",
    cacheFingerprint: input.sourceRevision,
    orbitLifecycle: Object.freeze({
      kind: "frm-like-v1",
      resetFunction: "frmV1ResetState",
      continueFunction: "frmV1ShouldContinue",
      eventFunction: "frmV1HasEvent",
    }),
  });

  return {
    ok: true,
    value: Object.freeze({ plugin, descriptor, backend: backend.backend }),
  };
}
