; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_d37c76aa_101e_5911_abd2_37ded44be307 {
  init:
    z = pixel
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sin(sqr(z)) + sin(z) + sin(juliaOrbitConstant)
  bailout:
    |z| <= 4
}