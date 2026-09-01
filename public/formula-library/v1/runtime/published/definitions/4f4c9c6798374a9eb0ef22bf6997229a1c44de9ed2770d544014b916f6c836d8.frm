; @language: frm-like/1
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
}