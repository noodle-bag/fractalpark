import type { FormulaIdV1 } from "@/engine/formulas/v1";
import type { NativeFormulaRecipeV1 } from "./native-recipes";

export const RECIPES: readonly NativeFormulaRecipeV1[] = Object.freeze([
  Object.freeze({ formulaId: "38c3b212-c33b-5dd3-aae5-a514fc7e37e3" as FormulaIdV1, runtimeId: "airship", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_38c3b212_c33b_5dd3_aae5_a514fc7e37e3 {
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
    z = folded * folded + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "2ab193f5-4919-5e5c-a9fb-c1a0e3f5eb02" as FormulaIdV1, runtimeId: "burningShip", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2ab193f5_4919_5e5c_a9fb_c1a0e3f5eb02 {
  parameters:
    power: real = 2
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    a = abs(z)
    if power == 2
      z = z * 0
      real(z) = real(a) * real(a) - imag(a) * imag(a)
      imag(z) = 2 * real(a) * imag(a)
      z = z + c
    else
      z = a ^ power + c
    endif
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "33236fd9-4bd1-539b-961a-7b95ab92a1e0" as FormulaIdV1, runtimeId: "burningShipImag", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_33236fd9_4bd1_539b_961a_7b95ab92a1e0 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    imag(z) = -abs(imag(z))
    z = z * z + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "a3ab1c2f-5940-51d3-8c13-58f7feeb084b" as FormulaIdV1, runtimeId: "cactus", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a3ab1c2f_5940_51d3_8c13_58f7feeb084b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    cm1 = c - (1, 0)
    z = z3 + cm1 * z - c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "8f661407-f2c9-57e5-8c01-9b63a3cd0493" as FormulaIdV1, runtimeId: "celticBurningShip", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8f661407_f2c9_57e5_8c01_9b63a3cd0493 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = abs(z)
    z2 = p * p
    z = z * 0
    real(z) = abs(real(z2))
    imag(z) = imag(z2)
    z = z + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "06223e69-6d8c-50ba-8e5d-b630d342d910" as FormulaIdV1, runtimeId: "celticMandelbar", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_06223e69_6d8c_50ba_8e5d_b630d342d910 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    folded = (0, 0)
    real(folded) = abs(real(z2))
    imag(folded) = imag(z2)
    z = conj(folded) + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "09ee96d1-18a8-5dad-83e1-d05f0c59be4b" as FormulaIdV1, runtimeId: "chebyshev2", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_09ee96d1_18a8_5dad_83e1_d05f0c59be4b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = 2 * (z * z) - (1, 0) + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "e1220621-19f8-54ef-ad36-4220b5d7fedc" as FormulaIdV1, runtimeId: "chebyshev3", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e1220621_19f8_54ef_ad36_4220b5d7fedc {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    z = 4 * z3 - 3 * z + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "18d30091-ce1c-5b10-b214-37eb4337df83" as FormulaIdV1, runtimeId: "chebyshev4", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_18d30091_ce1c_5b10_b214_37eb4337df83 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z4 = z2 * z2
    z = 8 * z4 - 8 * z2 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "34f41a82-3ede-5eda-8c1c-67962c37366b" as FormulaIdV1, runtimeId: "chebyshev5", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_34f41a82_3ede_5eda_8c1c_67962c37366b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    z4 = z2 * z2
    z5 = z4 * z
    z = 16 * z5 - 20 * z3 + 5 * z + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "34fcff23-f75a-539c-9102-181945abee60" as FormulaIdV1, runtimeId: "cubicMandelbrot", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_34fcff23_f75a_539c_9102_181945abee60 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    z = z3 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "4536f1e3-1f15-5b7e-8e58-68ea3b63d4fb" as FormulaIdV1, runtimeId: "heart", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4536f1e3_1f15_5b7e_8e58_68ea3b63d4fb {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    real(z) = abs(real(z))
    z = z * z + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "c1c898f3-c9a3-583d-9a0a-d09968ba0db3" as FormulaIdV1, runtimeId: "lambda", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c1c898f3_c9a3_583d_9a0a_d09968ba0db3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    actualZ = z + (0.5, 0)
    oneMinusZ = (1, 0) - actualZ
    z = c * (actualZ * oneMinusZ)
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "2daea798-a058-5b4c-ada8-1712c475fadf" as FormulaIdV1, runtimeId: "logistic", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2daea798_a058_5b4c_ada8_1712c475fadf {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 1e-10
      z = (0.5, 0)
    endif
  loop:
    oneMinusZ = (1, 0) - z
    z = c * (z * oneMinusZ)
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "12fc34ff-196d-5924-830e-6edb72dfc172" as FormulaIdV1, runtimeId: "magnet1", family: "magnet", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_12fc34ff_196d_5924_830e_6edb72dfc172 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    numerator = z + c
    denominator = z - c
    ratio = numerator / denominator
    z = ratio * ratio
  bailout:
    |z| <= 4
}` }),
  Object.freeze({ formulaId: "2dd8a5a7-052a-5539-aab9-c533f7dec857" as FormulaIdV1, runtimeId: "magnet2", family: "magnet", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2dd8a5a7_052a_5539_aab9_c533f7dec857 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    numerator = z2 + c
    denominator = z2 - c
    ratio = numerator / denominator
    z = ratio * ratio
  bailout:
    |z| <= 4
}` }),
  Object.freeze({ formulaId: "ca206908-8323-5ef9-979b-c80575765e63" as FormulaIdV1, runtimeId: "manowar", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ca206908_8323_5ef9_979b_c80575765e63 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    previousZ = (0, 0)
  loop:
    nextZ = z * z + previousZ + c
    previousZ = z
    z = nextZ
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "b9a54802-21b4-5cb9-8b8f-e4afc3c99f3b" as FormulaIdV1, runtimeId: "multicorn4", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b9a54802_21b4_5cb9_8b8f_e4afc3c99f3b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    a = conj(z)
    a2 = a * a
    z = a2 * a2 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "a69bc250-315d-5a74-9109-d23a820974e5" as FormulaIdV1, runtimeId: "multicorn6", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a69bc250_315d_5a74_9109_d23a820974e5 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = conj(z) ^ 6 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "f58059ef-67f2-58a4-bac0-bdb1d8608cc0" as FormulaIdV1, runtimeId: "multicorn7", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f58059ef_67f2_58a4_bac0_bdb1d8608cc0 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = conj(z) ^ 7 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "42d4c442-040b-59be-892f-1f10c8e47cb6" as FormulaIdV1, runtimeId: "perpendicularBurningShip", family: "burning-ship", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_42d4c442_040b_59be_892f_1f10c8e47cb6 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(imag(z))
    imag(p) = abs(real(z))
    z = p * p + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "627c38a8-8f4d-548f-a5a6-dd9f215adf60" as FormulaIdV1, runtimeId: "perpendicularCeltic", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_627c38a8_8f4d_548f_a5a6_dd9f215adf60 {
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
    z2 = p * p
    z = z * 0
    real(z) = abs(real(z2))
    imag(z) = imag(z2)
    z = z + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "d01f1a01-6e77-5a24-8593-a7009e1c3ea3" as FormulaIdV1, runtimeId: "perpendicularMandelbrot", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d01f1a01_6e77_5a24_8593_a7009e1c3ea3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = imag(z)
    imag(p) = abs(real(z))
    z = p * p + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "3a83800c-4a44-5e61-9651-d3d5adb71213" as FormulaIdV1, runtimeId: "perpendicularTricorn", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3a83800c_4a44_5e61_9651_d3d5adb71213 {
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
    z = conj(p * p) + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "0f49d971-917e-50a5-ae83-20e11fd4854c" as FormulaIdV1, runtimeId: "phoenixMulti", family: "phoenix", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0f49d971_917e_50a5_ae83_20e11fd4854c {
  parameters:
    phoenixMultiP: real = 0.5 domain [-2, 2]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    previousZ = (0, 0)
  loop:
    z2 = z * z
    nextZ = z2 + c + phoenixMultiP * previousZ
    previousZ = z
    z = nextZ
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "1768f194-bdc1-5881-b269-a58730967c2c" as FormulaIdV1, runtimeId: "quarticMandelbrot", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1768f194_bdc1_5881_b269_a58730967c2c {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z = z2 * z2 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "6b633456-4a1d-580e-9a61-6824ca303486" as FormulaIdV1, runtimeId: "rabbitJulia", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6b633456_4a1d_580e_9a61_6824ca303486 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    rabbitC = (-0.123, 0.745)
    z = z * z + rabbitC
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "d09224e0-8712-5ec3-bc1a-e951b3d42ca9" as FormulaIdV1, runtimeId: "simonBrot", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d09224e0_8712_5ec3_bc1a_e951b3d42ca9 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    z4 = z2 * z2
    z = z4 + z3 + c
  bailout:
    |z| <= 256
}` }),
  Object.freeze({ formulaId: "27a3da95-a9e6-5fc2-81af-d5e9076fc8fa" as FormulaIdV1, runtimeId: "tricorn", family: "classic", source: `; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_27a3da95_a9e6_5fc2_81af_d5e9076fc8fa {
  parameters:
    power: real = 2
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    a = conj(z)
    if power == 2
      z = z * 0
      real(z) = real(a) * real(a) - imag(a) * imag(a)
      imag(z) = 2 * real(a) * imag(a)
      z = z + c
    else
      z = a ^ power + c
    endif
  bailout:
    |z| <= 256
}` }),
]);
