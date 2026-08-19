; @language: frm-like/1
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
}