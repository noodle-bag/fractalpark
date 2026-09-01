; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c95aeaaa_10f4_5e83_ad16_169018862669 {
  parameters:
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    constant = pixel
    z = constant
  loop:
    z = (firstTransform(z) + constant) * (z < 0)
    z = (secondTransform(z) + constant) * (0 <= z)
  bailout:
    |z| < 4
}
