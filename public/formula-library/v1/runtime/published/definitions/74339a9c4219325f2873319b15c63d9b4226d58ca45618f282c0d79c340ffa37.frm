; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b1cee702_e3f6_557f_a277_365a5097016f {
  parameters:
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    constant = pixel
    z = constant
  loop:
    z = firstTransform(z) + constant
    z = secondTransform(z) + constant
  bailout:
    |z| < 4
}
