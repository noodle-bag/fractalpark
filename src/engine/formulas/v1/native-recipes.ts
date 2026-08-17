/**
 * Declarative native recipe layer v1 (planned commit 12b).
 *
 * A native recipe is a per-row declarative FRM-like v1 Definition authored from
 * FractalPark's own B94 native plugin runtime. The native plugin stays the
 * cross-check reference; the published source of truth is the canonical v1
 * source, compiled to CPU and GLSL from one typed IR by the production v1
 * backend. No per-formula-ID branches, tolerances, or test exemptions: every
 * recipe passes the same validation chain and the same cross-check contract.
 */

import { canonicalizeFrmLikeV1, hashFrmLikeV1, parseFrmLikeV1 } from "@/engine/frm/v1";
import { compileFrmLikeV1Backend } from "@/engine/frm/v1-backend";
import { pluginRegistry } from "@/engine/plugins/registry";
import {
  projectExecutableFormulaDefinitionV1,
  validateFormulaSafetyEnvelopeV1,
  type FormulaDefinitionV1,
  type FormulaIdV1,
  type FormulaRevisionV1,
} from "@/engine/formulas/v1";
import { resolveStandardAliasV1 } from "@/engine/formulas/v1/standard-manifest";

export const NATIVE_RECIPE_SCHEMA_V1 = "fractalpark-native-formula-recipes/v1";

export type NativeRecipeFamilyV1 =
  | "classic"
  | "burning-ship"
  | "newton"
  | "magnet"
  | "phoenix"
  | "transcendental"
  | "exotic";

export interface NativeFormulaRecipeV1 {
  readonly formulaId: FormulaIdV1;
  readonly runtimeId: string;
  readonly family: NativeRecipeFamilyV1;
  /** Canonical FRM-like v1 source; must equal the formatter output byte-for-byte. */
  readonly source: string;
}

/**
 * Shared cross-check contract. Probe pixels, iteration budget, and tolerance
 * are layer-wide constants; recipes never override them per row.
 */
export const NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1 = Object.freeze({
  probePixels: Object.freeze([
    Object.freeze([0.25, 0.1] as const),
    Object.freeze([-0.5, 0.3] as const),
    Object.freeze([0.3, -0.02] as const),
  ]),
  maxIterations: 16,
  /** Same relative tolerance family as the exact-677 census CPU/GPU parity gate. */
  relativeTolerance: 3e-4,
} as const);

/**
 * One orbit run in the shared cross-check shape. Both the v1 CPU oracle and
 * the native WebGL probe produce this shape, so comparison stays uniform.
 */
export interface NativeRecipeOrbitRunV1 {
  readonly pixel: readonly [number, number];
  readonly escapedAt: number | null;
  readonly event: "nonFinite" | null;
  readonly orbit: readonly (readonly [
    number | "non-finite",
    number | "non-finite",
  ])[];
}

export interface NativeRecipeCrossCheckVerdictV1 {
  readonly ok: boolean;
  readonly reasonCode?:
    | "run-count-mismatch"
    | "pixel-mismatch"
    | "event-mismatch"
    | "escape-index-mismatch"
    | "orbit-length-mismatch"
    | "orbit-value-mismatch";
  readonly runIndex?: number;
  readonly pointIndex?: number;
  readonly maxRelativeDelta?: number;
}

function crossCheckClose(actual: number, expected: number): boolean {
  const tolerance =
    NATIVE_RECIPE_CROSS_CHECK_CONTRACT_V1.relativeTolerance *
    Math.max(1, Math.abs(actual), Math.abs(expected));
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

/**
 * Compares one v1 orbit run set against the native reference run set under
 * the shared contract: same pixels, same event/escape indices, equal orbit
 * lengths, and pointwise relative tolerance. No per-row tolerance overrides.
 */
export function compareNativeRecipeOrbitsV1(
  v1Runs: readonly NativeRecipeOrbitRunV1[],
  nativeRuns: readonly NativeRecipeOrbitRunV1[],
): NativeRecipeCrossCheckVerdictV1 {
  if (v1Runs.length !== nativeRuns.length)
    return { ok: false, reasonCode: "run-count-mismatch" };
  let maxRelativeDelta = 0;
  for (const [runIndex, v1Run] of v1Runs.entries()) {
    const nativeRun = nativeRuns[runIndex]!;
    if (
      v1Run.pixel[0] !== nativeRun.pixel[0] ||
      v1Run.pixel[1] !== nativeRun.pixel[1]
    )
      return { ok: false, reasonCode: "pixel-mismatch", runIndex };
    if (v1Run.event !== nativeRun.event)
      return { ok: false, reasonCode: "event-mismatch", runIndex };
    if (v1Run.escapedAt !== nativeRun.escapedAt)
      return { ok: false, reasonCode: "escape-index-mismatch", runIndex };
    if (v1Run.orbit.length !== nativeRun.orbit.length)
      return { ok: false, reasonCode: "orbit-length-mismatch", runIndex };
    for (const [pointIndex, v1Point] of v1Run.orbit.entries()) {
      const nativePoint = nativeRun.orbit[pointIndex]!;
      for (const component of [0, 1] as const) {
        const actual = v1Point[component];
        const expected = nativePoint[component];
        if (actual === "non-finite" || expected === "non-finite") {
          if (actual !== expected)
            return {
              ok: false,
              reasonCode: "orbit-value-mismatch",
              runIndex,
              pointIndex,
            };
          continue;
        }
        const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
        maxRelativeDelta = Math.max(
          maxRelativeDelta,
          Math.abs(actual - expected) / scale,
        );
        if (!crossCheckClose(actual, expected))
          return {
            ok: false,
            reasonCode: "orbit-value-mismatch",
            runIndex,
            pointIndex,
            maxRelativeDelta,
          };
      }
    }
  }
  return { ok: true, maxRelativeDelta };
}

export type NativeRecipeValidationFailureV1 =
  | "recipe-identity-invalid"
  | "recipe-runtime-alias-mismatch"
  | "recipe-runtime-plugin-missing"
  | "recipe-family-mismatch"
  | "recipe-parse-failed"
  | "recipe-canonical-roundtrip-failed"
  | "recipe-safety-envelope-failed"
  | "recipe-backend-compile-failed";

export type NativeRecipeValidationResultV1 =
  | {
      readonly ok: true;
      readonly definition: FormulaDefinitionV1;
      readonly sourceRevision: string;
      readonly semanticHash: string;
    }
  | { readonly ok: false; readonly reasonCode: NativeRecipeValidationFailureV1 };

/**
 * Validates one recipe through the full production v1 chain: b94 alias join,
 * runtime plugin existence and family match, parse, canonical round-trip,
 * Safety Envelope, and backend compile. Pure data in, verdict out.
 */
export async function validateNativeRecipeV1(
  recipe: NativeFormulaRecipeV1,
): Promise<NativeRecipeValidationResultV1> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      recipe.formulaId,
    )
  )
    return { ok: false, reasonCode: "recipe-identity-invalid" };
  const joined = resolveStandardAliasV1("b94-canonical", `b94:${recipe.runtimeId}`);
  if (joined !== recipe.formulaId)
    return { ok: false, reasonCode: "recipe-runtime-alias-mismatch" };
  const plugin = pluginRegistry.getFormula(recipe.runtimeId);
  if (!plugin) return { ok: false, reasonCode: "recipe-runtime-plugin-missing" };
  if (plugin.family !== recipe.family)
    return { ok: false, reasonCode: "recipe-family-mismatch" };

  const parsed = parseFrmLikeV1(recipe.source);
  if (!parsed.ok) return { ok: false, reasonCode: "recipe-parse-failed" };
  if (canonicalizeFrmLikeV1(parsed.ir) !== recipe.source)
    return { ok: false, reasonCode: "recipe-canonical-roundtrip-failed" };

  const revisions = await hashFrmLikeV1(recipe.source, parsed.ir);
  const definition: FormulaDefinitionV1 = {
    schemaVersion: 1,
    formulaId: recipe.formulaId,
    scope: "standard",
    source: recipe.source,
    sourceRevision: revisions.sourceRevision as FormulaRevisionV1,
    semanticHash: revisions.semanticHash as FormulaRevisionV1,
    languageVersion: "frm-like/1",
    stdlibVersion: 1,
    supportedNumericProfiles: ["standard32"],
    parameters: parsed.ir.parameters,
    programModel: "orbit",
    termination: {
      predicateMeaning: "continue-iteration",
      nonFinite: "terminate-with-event",
      maximumIterations: "profile-resolved",
    },
    channels: [],
    capabilities: [],
  };
  const safety = await validateFormulaSafetyEnvelopeV1(
    projectExecutableFormulaDefinitionV1(definition),
  );
  if (!safety.ok) return { ok: false, reasonCode: "recipe-safety-envelope-failed" };
  const compiled = compileFrmLikeV1Backend(safety.ir);
  if (!compiled.ok) return { ok: false, reasonCode: "recipe-backend-compile-failed" };
  return {
    ok: true,
    definition,
    sourceRevision: revisions.sourceRevision,
    semanticHash: revisions.semanticHash,
  };
}

const MANDELBROT_SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_00e14aa8_b766_54ea_a359_3f5d20d329b7 {
  parameters:
    power: real = 2
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    if power == 2
      z = z * z + c
    else
      z = z ^ power + c
    endif
  bailout:
    |z| <= 256
}`;

const ACOSH_JULIA_SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c09b9dec_60a6_5a26_8f03_d5ea40f0d49b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = c * acosh(z)
  bailout:
    |z| <= 256
}`;

const PHOENIX_SOURCE = `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e2456b54_ef50_5ac9_9faa_dcb576c5e774 {
  parameters:
    phoenixP: real = -0.5 domain [-2, 2]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    previousZ = (0, 0)
  loop:
    nextZ = z * z + c + phoenixP * previousZ
    previousZ = z
    z = nextZ
  bailout:
    |z| <= 256
}`;

/**
 * Pilot registry (planned commit 12b): one recipe per construct class —
 * direct-multiply power branch (classic), transcendental stdlib mapping
 * (transcendental), and explicit two-step orbit memory (phoenix). The
 * remaining 86 B94 rows migrate family-by-family in planned commit 12c.
 */
export const NATIVE_FORMULA_RECIPES_V1: readonly NativeFormulaRecipeV1[] =
  Object.freeze([
    Object.freeze({
      formulaId: "00e14aa8-b766-54ea-a359-3f5d20d329b7" as FormulaIdV1,
      runtimeId: "mandelbrot",
      family: "classic",
      source: MANDELBROT_SOURCE,
    }),
    Object.freeze({
      formulaId: "c09b9dec-60a6-5a26-8f03-d5ea40f0d49b" as FormulaIdV1,
      runtimeId: "acoshJulia",
      family: "transcendental",
      source: ACOSH_JULIA_SOURCE,
    }),
    Object.freeze({
      formulaId: "e2456b54-ef50-5ac9-9faa-dcb576c5e774" as FormulaIdV1,
      runtimeId: "phoenix",
      family: "phoenix",
      source: PHOENIX_SOURCE,
    }),
  ]);
