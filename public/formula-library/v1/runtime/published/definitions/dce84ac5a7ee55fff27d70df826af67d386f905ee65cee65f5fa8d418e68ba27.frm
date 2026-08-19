; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_07a0afc6_ced5_5765_9314_fdb0ef593cb9 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = asinh(z) + c
  bailout:
    |z| <= 256
}