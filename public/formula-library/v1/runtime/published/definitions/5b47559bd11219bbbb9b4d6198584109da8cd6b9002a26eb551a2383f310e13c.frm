; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_3fc4005b_e6d4_5cda_a9b1_de96a0d6a458 {
  init:
    z = pixel
    offset = sin(pixel)
  loop:
    z = exp(z) + offset
  bailout:
    |z| <= 50
}
