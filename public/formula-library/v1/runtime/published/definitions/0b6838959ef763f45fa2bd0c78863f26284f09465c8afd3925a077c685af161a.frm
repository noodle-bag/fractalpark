; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_23d2bc83_a564_5890_b438_307333cbcf68 {
  init:
    z = pixel
    offset = exp(pixel)
  loop:
    z = cosh(z) + offset
  bailout:
    |z| <= 50
}
