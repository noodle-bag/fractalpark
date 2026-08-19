; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9c92a2b0_a3a8_55ca_b89c_941099319d6e {
  parameters:
    factor: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    z = pixel
    reciprocalPixel = 1 / pixel
  loop:
    z = transform(z) + reciprocalPixel * factor
  bailout:
    |z| <= 50
}
