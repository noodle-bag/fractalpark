; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_af500910_46ce_5a43_b430_c0154cc05959 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    stableExp = round(exp(z) * 16) / 16
    z = round((stableExp + c) * 16) / 16
  bailout:
    |z| <= 256
}