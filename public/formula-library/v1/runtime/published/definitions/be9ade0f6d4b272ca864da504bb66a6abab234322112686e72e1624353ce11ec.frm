; @language: frm-like/1
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
}