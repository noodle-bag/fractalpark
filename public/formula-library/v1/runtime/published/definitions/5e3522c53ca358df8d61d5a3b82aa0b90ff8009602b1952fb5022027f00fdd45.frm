; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_dd052c9f_868f_5516_9af0_3f4e78ac7a13 {
  init:
    z = pixel
  loop:
    z2 = z * z
    z3 = z2 * z
    numerator = 2 * z3 + 1
    denominator = 3 * z2
    z = numerator / denominator
  bailout:
    |z - zPrev| >= 0.000001
}