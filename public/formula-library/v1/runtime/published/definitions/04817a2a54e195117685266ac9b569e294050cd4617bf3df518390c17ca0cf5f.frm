; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e435bbb6_d866_5876_9f16_f04fbe61ff2b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z = abs(z2 + c)
  bailout:
    |z| <= 256
}