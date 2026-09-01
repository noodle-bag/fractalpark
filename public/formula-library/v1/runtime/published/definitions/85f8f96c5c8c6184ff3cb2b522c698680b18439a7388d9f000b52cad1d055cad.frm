; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6df24dea_4668_5590_b251_c9bf208aa45d {
  init:
    x = real(pixel)
    y = imag(pixel)
    orbitConstant = x * (cos(y) + x * sin(y))
    z = 0
  loop:
    z = sqr(z) + orbitConstant
  bailout:
    |z| < 4
}
