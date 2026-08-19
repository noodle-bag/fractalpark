; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_c1a0a2a9_d5d5_5f53_8d0b_64c49ce9162f {
  init:
    z = pixel
    offsetValue = cosxx(pixel)
  loop:
    z = exp(z) + offsetValue
  bailout:
    |z| <= 50
}

