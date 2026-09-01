import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";

/**
 * Batch 2 supplement: rows whose native helpers carry legacy numeric guards.
 * The clamp/flatten reconstruction is explicit per-row Definition semantics:
 * complexCoshVec/complexSinhVec clamp the REAL component at ±80 before the
 * complex hyperbolic; complexSin/complexCos clamp the IMAGINARY component;
 * complexExp is unclamped; complexLog floors the radius at 1e-20 (tetration
 * reproduces it with an explicit branch). Collatz keeps the native truncated
 * pi literal 3.14159. zaslavskyMap builds the constant rotation complex from
 * stdlib sin/cos on a real literal, mirroring the native per-step evaluation.
 */
export const RECIPES: readonly NativeFormulaRecipeV1[] = Object.freeze([
  Object.freeze({
    formulaId: "9b437c43-72bc-51a3-8b61-227f916d724c" as FormulaIdV1,
    runtimeId: "sinhJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9b437c43_72bc_51a3_8b61_227f916d724c {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    clampedZ = z
    if real(z) > 80
      real(clampedZ) = 80
    elseif real(z) < -80
      real(clampedZ) = -80
    endif
    z = c * sinh(clampedZ)
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "9693612f-d5c2-5d77-9058-58ee16e14b4b" as FormulaIdV1,
    runtimeId: "sineJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9693612f_d5c2_5d77_9058_58ee16e14b4b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    clampedZ = z
    if imag(z) > 80
      imag(clampedZ) = 80
    elseif imag(z) < -80
      imag(clampedZ) = -80
    endif
    z = c * sin(clampedZ)
  bailout:
    |z| <= 256
}`,
  }),
]);
