; @language: frm-like/1
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
}