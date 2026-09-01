; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_74406ccc_7611_5893_b076_733e7c288c61 {
  init:
    if ismand
      shift = log(pixel)
    else
      shift = c
    endif
    z = pixel
    if !ismand
      z = pixel
    endif
  loop:
    z = cosh(z) + shift / 2
  bailout:
    |z| <= 4
}