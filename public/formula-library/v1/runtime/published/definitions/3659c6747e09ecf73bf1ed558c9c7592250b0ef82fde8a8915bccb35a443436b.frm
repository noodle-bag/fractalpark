; @language: frm-like/1
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
}