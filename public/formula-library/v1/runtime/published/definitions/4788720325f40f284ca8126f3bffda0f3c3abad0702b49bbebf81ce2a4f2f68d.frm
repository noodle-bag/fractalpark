; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c09b9dec_60a6_5a26_8f03_d5ea40f0d49b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = c * acosh(z)
  bailout:
    |z| <= 256
}