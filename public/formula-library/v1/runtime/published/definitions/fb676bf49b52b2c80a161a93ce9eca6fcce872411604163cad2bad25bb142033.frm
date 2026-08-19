; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_74406ccc_7611_5893_b076_733e7c288c61 {
  init:
    shift = log(pixel)
    z = pixel
  loop:
    z = cosh(z) + shift / 2
  bailout:
    |z| <= 4
}
