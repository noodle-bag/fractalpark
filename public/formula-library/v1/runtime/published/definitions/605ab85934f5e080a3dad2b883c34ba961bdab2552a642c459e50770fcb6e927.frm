; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_59dd9fd1_38d1_5887_a9f6_b6941f532cad {
  init:
    z = pixel
  loop:
    z = sqr(sin(z)) + pixel
  bailout:
    |z| <= 4
}
