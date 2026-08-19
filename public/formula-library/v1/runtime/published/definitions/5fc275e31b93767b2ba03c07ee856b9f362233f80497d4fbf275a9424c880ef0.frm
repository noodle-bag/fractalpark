; @language: frm-like/1
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
}