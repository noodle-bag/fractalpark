import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";
import { RECIPES as RECOVERED_TRANSCENDENTAL_RECIPES } from "./native-recipes-b94-recovered-transcendental";

export type NativeRecipeHoldClassV1 =
  | "chaotic-amplification"
  | "swiftshader-transcendental"
  | "ill-conditioned-cancellation";

/**
 * A project-owned recipe that remains publication-held. Some rows are still
 * diagnosis-held; recovered rows intentionally overlap the accepted technical
 * registry until the separate 21/21 publication gate is released. No
 * tolerance is widened and no partial publication is possible.
 */
export interface NativeRecipeHoldV1 {
  readonly recipe: NativeFormulaRecipeV1;
  readonly holdClass: NativeRecipeHoldClassV1;
  readonly evidence: string;
}

export const NATIVE_RECIPE_HOLDS_V1: readonly NativeRecipeHoldV1[] = Object.freeze([
...RECOVERED_TRANSCENDENTAL_RECIPES.map((recipe) =>
  Object.freeze({
    holdClass: "swiftshader-transcendental" as const,
    evidence:
      "26a shared output-grid recovery candidate; remains held until the exact 21/21 publication gate is released",
    recipe,
  }),
),
  Object.freeze({
    holdClass: "chaotic-amplification",
    evidence: "cross-check delta 9.7e-4 at run 3 point 2; per-step polar-pow vs exp/log-pow divergence amplified by the cubic map",
    recipe: Object.freeze({ formulaId: "42b369a5-2873-50e9-8684-cad5e60630ff" as FormulaIdV1, runtimeId: "airshipCubic", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_42b369a5_2873_50e9_8684_cad5e60630ff {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    safeY = (1, 0)
    if abs(imag(z)) >= 1e-10
      real(safeY) = imag(z) / abs(imag(z))
    endif
    folded = (0, 0)
    real(folded) = abs(real(z))
    imag(folded) = real(z) * imag(z) / real(safeY)
    z = folded ^ 3 + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "chaotic-amplification",
  evidence: "delta 2.1e-3 at run 1 point 5; first-step delta 2.1e-5 from polar vs exp/log pow, cubically amplified",
    recipe: Object.freeze({ formulaId: "465a5b03-469d-59b3-8564-45af7564e37a" as FormulaIdV1, runtimeId: "burningShipCubic", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_465a5b03_469d_59b3_8564_45af7564e37a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = abs(z)
    z = p ^ 3 + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "chaotic-amplification",
  evidence: "delta 3.8e-4 at run 1 point 5; pow-path divergence, quartic amplification",
    recipe: Object.freeze({ formulaId: "46acfdeb-2dac-59c9-a94a-fd4809420dc2" as FormulaIdV1, runtimeId: "burningShipQuartic", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_46acfdeb_2dac_59c9_a94a_fd4809420dc2 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = abs(z)
    z = p ^ 4 + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "chaotic-amplification",
  evidence: "delta 2.1e-3 at run 1 point 5; pow-path divergence, cubic amplification",
    recipe: Object.freeze({ formulaId: "e375f423-dfa4-54bf-9d56-c41215f4f72a" as FormulaIdV1, runtimeId: "cubicPerpendicularMandelbrot", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e375f423_dfa4_54bf_9d56_c41215f4f72a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(real(z))
    imag(p) = imag(z)
    z = p ^ 3 + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "chaotic-amplification",
  evidence: "bit-exact through 8 steps then smooth ulp growth to 1.4e-3 at step 16 (run 0); GPU division rounding near fold boundaries; translation verified faithful by the exact prefix",
    recipe: Object.freeze({ formulaId: "280cd3e2-865b-5c78-90b7-39b2a36d7be0" as FormulaIdV1, runtimeId: "mandelbox", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_280cd3e2_865b_5c78_90b7_39b2a36d7be0 {
  parameters:
    mandelboxScale: real = 2 domain [-3, 3]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    if real(z) < -1
      boxX = -1
    elseif real(z) > 1
      boxX = 1
    else
      boxX = real(z)
    endif
    if imag(z) < -1
      boxY = -1
    elseif imag(z) > 1
      boxY = 1
    else
      boxY = imag(z)
    endif
    box = (0, 0)
    real(box) = boxX
    imag(box) = boxY
    z = box * 2 - z
    r2 = real(z) * real(z) + imag(z) * imag(z)
    if r2 < 0.25
      z = z * 4
    elseif r2 < 1
      z = z / r2
    endif
    z = mandelboxScale * z + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "chaotic-amplification",
  evidence: "delta 3.8e-4 at run 3 point 2; pow-path divergence",
    recipe: Object.freeze({ formulaId: "ed671b4c-a04c-5545-ad0c-a73727761ce8" as FormulaIdV1, runtimeId: "multicorn5", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ed671b4c_a04c_5545_ad0c_a73727761ce8 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = conj(z) ^ 5 + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "chaotic-amplification",
  evidence: "delta 3.8e-4 at run 1 point 5; pow-path divergence",
    recipe: Object.freeze({ formulaId: "d747aff8-e49f-5875-a85f-89d4a1d25846" as FormulaIdV1, runtimeId: "quarticPerpendicularMandelbrot", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d747aff8_e49f_5875_a85f_89d4a1d25846 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(real(z))
    imag(p) = imag(z)
    z = p ^ 4 + c
  bailout:
    |z| <= 256
}` }),
}),
Object.freeze({
  holdClass: "ill-conditioned-cancellation",
  evidence: "step-1 delta 5.6e-4: cosh(z)-1 catastrophic cancellation near the origin amplifies SwiftShader cosh absolute error; escape index flips at run 0",
    recipe: Object.freeze({
    formulaId: "a89891b1-8ccb-5d58-9fbb-05944b85ce3c" as FormulaIdV1,
    runtimeId: "newtonCosh",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a89891b1_8ccb_5d58_9fbb_05944b85ce3c {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.2, 0)
    endif
  loop:
    clampedZ = z
    if real(z) > 80
      real(clampedZ) = 80
    elseif real(z) < -80
      real(clampedZ) = -80
    endif
    denom = sinh(clampedZ)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z - (cosh(clampedZ) - (1, 0)) / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
}),
Object.freeze({
  holdClass: "ill-conditioned-cancellation",
  evidence: "escape-index flip at run 0; exp-based correction near the fixed point amplifies SwiftShader exp error across the converge threshold",
    recipe: Object.freeze({
    formulaId: "bb186688-4571-5725-a8ed-a17e0100dbc8" as FormulaIdV1,
    runtimeId: "newtonExp",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bb186688_4571_5725_a8ed_a17e0100dbc8 {
  init:
    z = pixel
  loop:
    expZ = exp(z)
    z = z - (1, 0) + (1, 0) / expZ
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
}),
]);
