; @language: frm-like/1
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
}