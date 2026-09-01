; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ed671b4c_a04c_5545_ad0c_a73727761ce8 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = conj(z) ^ 5 + c
  bailout:
    |z| <= 256
}