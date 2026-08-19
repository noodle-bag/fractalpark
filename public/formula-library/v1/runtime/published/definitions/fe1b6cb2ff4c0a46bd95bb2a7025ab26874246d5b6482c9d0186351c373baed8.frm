; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_189a3551_e768_55db_b9f5_a3c4e35f9927 {
  parameters:
    factor: complex = (0, 0) classic p1
    outerTransform: function = identity classic fn1
    innerTransform: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = factor * outerTransform(innerTransform(z + factor))
  bailout:
    |z| <= 4
}
