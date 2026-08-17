import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";

export type NativeRecipeHoldClassV1 =
  | "chaotic-amplification"
  | "swiftshader-transcendental"
  | "ill-conditioned-cancellation";

/**
 * A translated recipe whose orbit evidence cannot close inside the frozen
 * cross-check contract. The translation itself is structurally faithful
 * (fidelity audit + early-step prefix agreement); the hold records WHY the
 * conformance evidence is insufficient. Planned commit 12d owns the
 * diagnosis and possible closure; no tolerance is widened to admit these.
 */
export interface NativeRecipeHoldV1 {
  readonly recipe: NativeFormulaRecipeV1;
  readonly holdClass: NativeRecipeHoldClassV1;
  readonly evidence: string;
}

export const NATIVE_RECIPE_HOLDS_V1: readonly NativeRecipeHoldV1[] = Object.freeze([
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
  holdClass: "swiftshader-transcendental",
  evidence: "delta 7.4e-4 at run 3 point 2 (escaping pixel); SwiftShader hyperbolic precision",
    recipe: Object.freeze({
    formulaId: "62098934-def3-527a-ac43-2c80449c9848" as FormulaIdV1,
    runtimeId: "coshJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_62098934_def3_527a_ac43_2c80449c9848 {
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
    z = c * cosh(clampedZ)
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "v1 CPU vs v1 GLSL delta 1.6e-4 at step 2 (run 1); SwiftShader cos/sinh ~1e-4 absolute error",
    recipe: Object.freeze({
    formulaId: "201c54f3-a77a-5be0-a0a5-6f4f1998ee6d" as FormulaIdV1,
    runtimeId: "coshMandelb",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_201c54f3_a77a_5be0_a0a5_6f4f1998ee6d {
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
    z = cosh(clampedZ) + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 3.1e-4 at run 0 point 2; SwiftShader hyperbolic precision",
    recipe: Object.freeze({
    formulaId: "d89f722f-35fe-587a-bee9-efdf05885728" as FormulaIdV1,
    runtimeId: "coshSinh",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d89f722f_35fe_587a_bee9_efdf05885728 {
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
    z = cosh(clampedZ) * sinh(clampedZ) + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 3.4e-4 at run 0 point 4; SwiftShader hyperbolic precision",
    recipe: Object.freeze({
    formulaId: "190fa538-89c9-590f-8170-34b3c570fc5d" as FormulaIdV1,
    runtimeId: "sinhMandelb",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_190fa538_89c9_590f_8170_34b3c570fc5d {
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
    z = sinh(clampedZ) + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 7.4e-4 at run 3 point 2; SwiftShader trig precision",
    recipe: Object.freeze({
    formulaId: "3edbea29-956a-5900-9aa7-02ccc2183016" as FormulaIdV1,
    runtimeId: "cosJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3edbea29_956a_5900_9aa7_02ccc2183016 {
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
    z = c * cos(clampedZ)
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 4.0e-4 at run 3 point 1; SwiftShader trig precision",
    recipe: Object.freeze({
    formulaId: "9f301c01-13fa-57b4-a3b2-99add821bfb0" as FormulaIdV1,
    runtimeId: "cosMandelb",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9f301c01_13fa_57b4_a3b2_99add821bfb0 {
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
    z = cos(clampedZ) + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 7.3e-4 at run 3 point 4; SwiftShader trig precision",
    recipe: Object.freeze({
    formulaId: "beeb4aec-91cd-5d01-83bb-0b98ca851e79" as FormulaIdV1,
    runtimeId: "sineMandelb",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_beeb4aec_91cd_5d01_83bb_0b98ca851e79 {
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
    z = sin(clampedZ) + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 5.9e-4 at run 0 point 2; SwiftShader exp precision",
    recipe: Object.freeze({
    formulaId: "af500910-46ce-5a43-b430-c0154cc05959" as FormulaIdV1,
    runtimeId: "expMandelbrot",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_af500910_46ce_5a43_b430_c0154cc05959 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = exp(z) + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 4.5e-4 at run 1 point 3; exp/log composition precision",
    recipe: Object.freeze({
    formulaId: "17d88272-6dbf-5622-996a-b116ea3a3fab" as FormulaIdV1,
    runtimeId: "tetration",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_17d88272_6dbf_5622_996a_b116ea3a3fab {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    if |c| < 1e-20
      logC = (-46.051701859880914, 0)
      imag(logC) = atan2(imag(c), real(c))
    else
      logC = log(c)
    endif
    z = exp(z * logC)
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 1.6e-3 at run 0 point 4; cos(pi*z) with truncated-pi literal, SwiftShader trig precision",
    recipe: Object.freeze({
    formulaId: "8eb342fe-8a05-524e-8b98-35cdc8af5be3" as FormulaIdV1,
    runtimeId: "collatz",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8eb342fe_8a05_524e_8b98_35cdc8af5be3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    piZ = 3.14159 * z
    clampedPiZ = piZ
    if imag(piZ) > 80
      imag(clampedPiZ) = 80
    elseif imag(piZ) < -80
      imag(clampedPiZ) = -80
    endif
    cosPiZ = cos(clampedPiZ)
    term = (1 + 2 * z) * cosPiZ
    z = (1 + 4 * z - term) / 4 + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 5.0e-4 at run 0 point 6; SwiftShader sin/cos precision",
    recipe: Object.freeze({
    formulaId: "22d9a008-eb14-53de-9960-11eb5d37bb8e" as FormulaIdV1,
    runtimeId: "zaslavskyMap",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_22d9a008_eb14_53de_9960_11eb5d37bb8e {
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
    swirl = z + 0.28 * sin(clampedZ)
    rotCos = cos((0.55, 0))
    rotSin = sin((0.55, 0))
    rot = rotCos
    imag(rot) = real(rotSin)
    z = swirl * rot + c
  bailout:
    |z| <= 256
}`,
  }),
}),
Object.freeze({
  holdClass: "swiftshader-transcendental",
  evidence: "delta 8.1e-4 at run 1 point 6; polar-pow reconstruction (atan2/cos/sin) hits SwiftShader trig precision",
    recipe: Object.freeze({
    formulaId: "78e550c6-d58d-57b7-92ff-82e9ed0728f0" as FormulaIdV1,
    runtimeId: "newton6",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_78e550c6_d58d_57b7_92ff_82e9ed0728f0 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    r = |z|
    theta = atan2(imag(z), real(z))
    rn = r ^ 5
    ntheta = 5 * theta
    z5 = z
    real(z5) = rn * cos(ntheta)
    imag(z5) = rn * sin(ntheta)
    z6 = z5 * z
    fp = 6 * z5
    if real(fp) * real(fp) + imag(fp) * imag(fp) < 1e-10
      z = z
    else
      z = z - (z6 - (1, 0)) / fp
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
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
