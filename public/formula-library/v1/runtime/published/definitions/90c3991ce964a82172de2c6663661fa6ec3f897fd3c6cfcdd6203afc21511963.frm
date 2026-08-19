; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_d37c76aa_101e_5911_abd2_37ded44be307 {
  init:
    z = pixel
  loop:
    z = sin(sqr(z)) + sin(z) + sin(pixel)
  bailout:
    |z| <= 4
}

