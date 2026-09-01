; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a1d276ef_65af_501c_b787_f98365f8a6d5 {
  init:
    z = pixel
    if ismand
      f = sqr(pixel)
    else
      f = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = exp(z) + f
  bailout:
    |z| <= 50
}