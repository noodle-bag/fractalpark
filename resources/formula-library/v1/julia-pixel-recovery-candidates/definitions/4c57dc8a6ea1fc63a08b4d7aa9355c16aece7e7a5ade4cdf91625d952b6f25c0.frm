; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_3f1835a4_0bd3_54ec_8d3b_dad2c6d3bfd3 {
  init:
    z = pixel
    if ismand
      offset = cosh(pixel)
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sin(z) + offset
  bailout:
    |z| <= 50
}