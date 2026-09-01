import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";

export const RECIPES: readonly NativeFormulaRecipeV1[] = Object.freeze([
  Object.freeze({
    formulaId: "b79313f5-2181-5013-bd21-e59a7222dce5" as FormulaIdV1,
    runtimeId: "halleyCubic",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b79313f5_2181_5013_bd21_e59a7222dce5 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    f = z3 - (1, 0)
    fp = 3 * z2
    fpp = 6 * z
    denom = 2 * (fp * fp) - f * fpp
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      numer = 2 * (f * fp)
      z = z - numer / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "75e70076-b422-5535-b3c9-c484fbf879e6" as FormulaIdV1,
    runtimeId: "newton4",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_75e70076_b422_5535_b3c9_c484fbf879e6 {
  init:
    z = pixel
  loop:
    z2 = z * z
    z3 = z2 * z
    z4 = z2 * z2
    numerator = 3 * z4 + (1, 0)
    denominator = 4 * z3
    z = numerator / denominator
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "e44d5dec-2cee-53a9-a21d-541c929792f6" as FormulaIdV1,
    runtimeId: "newton5",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e44d5dec_2cee_53a9_a21d_541c929792f6 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z4 = z ^ 4
    z5 = z4 * z
    fp = 5 * z4
    if real(fp) * real(fp) + imag(fp) * imag(fp) < 1e-10
      z = z
    else
      z = z - (z5 - (1, 0)) / fp
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "d0079630-8ed3-5379-9e37-52cb7f0f7379" as FormulaIdV1,
    runtimeId: "newtonCos",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d0079630_8ed3_5379_9e37_52cb7f0f7379 {
  init:
    z = pixel
  loop:
    denom = sin(z) + (1, 0)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z + (cos(z) - z) / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "848e8cdc-d391-5098-9fdc-1de2f83be3f0" as FormulaIdV1,
    runtimeId: "newtonSin",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_848e8cdc_d391_5098_9fdc_1de2f83be3f0 {
  init:
    z = pixel
  loop:
    sinZ = sin(z)
    cosZ = cos(z)
    z = z - sinZ / cosZ
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "6d27b5fd-462b-5561-bac2-7c5f915e3cb5" as FormulaIdV1,
    runtimeId: "newtonSinh",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6d27b5fd_462b_5561_bac2_7c5f915e3cb5 {
  init:
    z = pixel
  loop:
    denom = cosh(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z - sinh(z) / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "599a7fda-4c0e-5489-b12e-6e4179ee11f2" as FormulaIdV1,
    runtimeId: "novaBasin",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_599a7fda_4c0e_5489_b12e_6e4179ee11f2 {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    f = z3 - (1, 0)
    fp = 3 * z2
    correction = f / fp
    z = z - correction + (real(correction) * real(correction) + imag(correction) * imag(correction)) * 0.08
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "a63c7852-626f-5659-a556-b0193030f25b" as FormulaIdV1,
    runtimeId: "novaClassic",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a63c7852_626f_5659_a556_b0193030f25b {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    f = z3 - (1, 0)
    fp = 3 * z2
    correction = f / fp
    twist = correction * (0, 0.12)
    z = z - correction + twist
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "4514ac15-fecc-5b92-9e79-0b95b5158d3f" as FormulaIdV1,
    runtimeId: "novaCos",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4514ac15_fecc_5b92_9e79_0b95b5158d3f {
  init:
    z = pixel
  loop:
    denom = sin(z) + (1, 0)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z + (cos(z) - z) / denom + 0.15 * c
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
  Object.freeze({
    formulaId: "0df5ac6e-d97e-55db-b624-96c310af07dd" as FormulaIdV1,
    runtimeId: "novaSine",
    family: "newton",
    source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0df5ac6e_d97e_55db_b624_96c310af07dd {
  init:
    z = pixel
  loop:
    denom = cos(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z - sin(z) / denom + 0.18 * c
    endif
  bailout:
    |z - zPrev| >= 0.000001
}`,
  }),
]);
