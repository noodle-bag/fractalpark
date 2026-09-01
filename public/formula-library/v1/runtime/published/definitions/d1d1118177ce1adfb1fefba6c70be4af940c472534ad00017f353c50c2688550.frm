; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_f6126a12_f689_5eac_8917_71580950caba {
  init:
    z = pixel
    offsetValue = exp(pixel)
  loop:
    z = sin(z) + offsetValue
  bailout:
    |z| <= 50
}

