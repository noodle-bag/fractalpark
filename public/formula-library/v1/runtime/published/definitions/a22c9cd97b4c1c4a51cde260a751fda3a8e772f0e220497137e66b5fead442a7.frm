; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_247a0490_dacf_5df2_8a6f_67514402e4d2 {
  parameters:
    seedAndLimit: complex = (0, 0) classic p1
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    z = seedAndLimit
    magnitude = |z|
  loop:
    z = firstTransform(z)
    z = secondTransform(z) + pixel
    magnitude = |z|
  bailout:
    |z| <= real(seedAndLimit)
}
