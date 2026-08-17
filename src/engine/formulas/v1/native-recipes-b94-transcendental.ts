import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";

export const RECIPES: readonly NativeFormulaRecipeV1[] = Object.freeze([
  Object.freeze({
    formulaId: "cb9f75de-2acb-563b-9090-f58f17e65f92" as FormulaIdV1,
    runtimeId: "acoshMandelbrot",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cb9f75de_2acb_563b_9090_f58f17e65f92 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = acosh(z) + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "b6ccba60-aba6-5136-9c92-679ae55ba5ce" as FormulaIdV1,
    runtimeId: "asinhJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b6ccba60_aba6_5136_9c92_679ae55ba5ce {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = c * asinh(z)
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "07a0afc6-ced5-5765-9314-fdb0ef593cb9" as FormulaIdV1,
    runtimeId: "asinhMandelbrot",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_07a0afc6_ced5_5765_9314_fdb0ef593cb9 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = asinh(z) + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "88dd57cd-a348-55e8-983a-74c0acba57ae" as FormulaIdV1,
    runtimeId: "atanhJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_88dd57cd_a348_55e8_983a_74c0acba57ae {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    one = (1, 0)
    atanhZ = 0.5 * (log(one + z) - log(one - z))
    z = c * atanhZ
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "ecee6e9d-a5c9-5b29-be39-edbe00e73c50" as FormulaIdV1,
    runtimeId: "atanhMandelbrot",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ecee6e9d_a5c9_5b29_be39_edbe00e73c50 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    one = (1, 0)
    atanhZ = 0.5 * (log(one + z) - log(one - z))
    z = atanhZ + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "a569d2c4-d397-5634-9dfe-21b2ab1a386a" as FormulaIdV1,
    runtimeId: "buffalo",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a569d2c4_d397_5634_9dfe_21b2ab1a386a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    x2 = abs(real(z)) * abs(real(z))
    y2 = abs(imag(z)) * abs(imag(z))
    nextZ = (0, 0)
    real(nextZ) = x2 - y2
    imag(nextZ) = 2 * real(z) * abs(imag(z))
    z = nextZ + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "6c1385a9-2d23-5816-90d1-2752905fc353" as FormulaIdV1,
    runtimeId: "circleInversion",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6c1385a9_2d23_5816_90d1_2752905fc353 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    denom = real(z2) * real(z2) + imag(z2) * imag(z2)
    if denom < 1e-10
      denom = 1e-10
    endif
    invZ2 = (0, 0)
    real(invZ2) = real(z2) / denom
    imag(invZ2) = -imag(z2) / denom
    z = invZ2 + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "8f9eb07a-b405-5d9c-8b6a-9447ad7165b0" as FormulaIdV1,
    runtimeId: "cothJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8f9eb07a_b405_5d9c_8b6a_9447ad7165b0 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    denom = sinh(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = c * (cosh(z) / denom)
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "ebe7d5f6-7f65-50cc-b03b-f208d78c955a" as FormulaIdV1,
    runtimeId: "cothMandelbrot",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ebe7d5f6_7f65_50cc_b03b_f208d78c955a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    denom = sinh(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = cosh(z) / denom + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "56935004-bdb8-5682-974f-3821cd422965" as FormulaIdV1,
    runtimeId: "frothyBasin",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_56935004_bdb8_5682_974f_3821cd422965 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = z * z - conj(z) * c + c
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "c6b5dcf4-cef5-5630-b3f6-a68b92ae75ee" as FormulaIdV1,
    runtimeId: "invertedLambda",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c6b5dcf4_cef5_5630_b3f6_a68b92ae75ee {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    oneMinusZ = (1, 0) - z
    lambdaTerm = c * (z * oneMinusZ)
    denom = z * z + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    reciprocalTerm = (0.18, 0) / denom
    z = lambdaTerm + reciprocalTerm
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "d93a2f0f-7208-5019-ad82-7a1d319a4412" as FormulaIdV1,
    runtimeId: "logJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d93a2f0f_7208_5019_ad82_7a1d319a4412 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z = c * log(z)
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "cc40b50c-d3ff-54f0-b4ea-98bdf0fd0096" as FormulaIdV1,
    runtimeId: "mcMullen23",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cc40b50c_d3ff_54f0_b4ea_98bdf0fd0096 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z3 = z ^ 3
    denom = z3
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z * z + c / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "9577c6c0-3a56-5a17-bea5-0ad2d6ea7e08" as FormulaIdV1,
    runtimeId: "mcMullen32",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9577c6c0_3a56_5a17_bea5_0ad2d6ea7e08 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    denom = z2
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z2 * z + c / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "48a9aa85-f5d4-5f9a-b640-89e93890a8ad" as FormulaIdV1,
    runtimeId: "mcMullen34",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_48a9aa85_f5d4_5f9a_b640_89e93890a8ad {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z4 = z ^ 4
    denom = z4
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z ^ 3 + c / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "37425fb2-8542-502f-94ac-94c0ccb6e508" as FormulaIdV1,
    runtimeId: "rationalMap1",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_37425fb2_8542_502f_94ac_94c0ccb6e508 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    numer = z * z
    denom = z + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = numer / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "b0bf5217-893a-5a0f-9a46-5e5ce89223c3" as FormulaIdV1,
    runtimeId: "rationalMap2",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b0bf5217_893a_5a0f_9a46_5e5ce89223c3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    denom = z2 + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z3 / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "35a7e33c-fcba-5a81-ba80-8eab6d59925c" as FormulaIdV1,
    runtimeId: "reciprocalCubic",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_35a7e33c_fcba_5a81_ba80_8eab6d59925c {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    denom = z ^ 3 + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = (1, 0) / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "2edf64a9-157c-57d7-8894-1f4781bc4f8c" as FormulaIdV1,
    runtimeId: "reciprocalQuadratic",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2edf64a9_157c_57d7_8894_1f4781bc4f8c {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    denom = z * z + c
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = (1, 0) / denom
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "d848b143-1bb8-524e-b716-f0dd41a836df" as FormulaIdV1,
    runtimeId: "rings",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d848b143_1bb8_524e_b716_f0dd41a836df {
  parameters:
    ringsP: real = 0.5 domain [-2, 2]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    r2 = real(z) * real(z) + imag(z) * imag(z)
    if r2 < 1e-10
      z = z * z + c
    else
      numerator = (0, 0)
      real(numerator) = ringsP
      z = z * z + c + numerator / z
    endif
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "a9263b21-23c1-5d94-ba30-f7bef1a66629" as FormulaIdV1,
    runtimeId: "spider",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a9263b21_23c1_5d94_ba30_f7bef1a66629 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    if |z| > 0.001
      z = z2 + c / z
    else
      z = z2 + c
    endif
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "d541fbeb-4dcc-5fc9-9b88-116bb28bf327" as FormulaIdV1,
    runtimeId: "tanJulia",
    family: "transcendental",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d541fbeb_4dcc_5fc9_9b88_116bb28bf327 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = c * tan(z)
  bailout:
    |z| <= 256
}`,
  }),
  Object.freeze({
    formulaId: "e435bbb6-d866-5876-9f16-f04fbe61ff2b" as FormulaIdV1,
    runtimeId: "zubieta",
    family: "exotic",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e435bbb6_d866_5876_9f16_f04fbe61ff2b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z = abs(z2 + c)
  bailout:
    |z| <= 256
}`,
  }),
]);
