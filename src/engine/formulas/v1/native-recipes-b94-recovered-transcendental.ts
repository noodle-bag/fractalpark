import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";

/** Recovered with one shared output-grid remedy; see 26a convergence evidence. */
export const RECIPES: readonly NativeFormulaRecipeV1[] = Object.freeze([
  Object.freeze({
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
    z = round(c * cosh(clampedZ) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    stableCosh = round(cosh(clampedZ) * 16) / 16
    z = round((stableCosh + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    if real(z) > 8
      real(clampedZ) = 8
    elseif real(z) < -8
      real(clampedZ) = -8
    endif
    stableCosh = round(cosh(clampedZ) * 16) / 16
    stableSinh = round(sinh(clampedZ) * 16) / 16
    z = round((stableCosh * stableSinh + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round((sinh(clampedZ) + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round(c * cos(clampedZ) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round((cos(clampedZ) + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round((sin(clampedZ) + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    stableExp = round(exp(z) * 16) / 16
    z = round((stableExp + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round(exp(z * logC) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round(((1 + 4 * z - term) / 4 + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
    z = round((swirl * rot + c) * 16) / 16
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
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
      z = round(z * 16) / 16
    else
      z = round((z - (z6 - (1, 0)) / fp) * 16) / 16
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
]);
