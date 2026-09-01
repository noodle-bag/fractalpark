; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_962d33f0_f95b_58db_9450_47088ecc26ac {
  parameters:
    transform: function = identity classic fn1
  init:
    q = transform(pixel)
    z = (0, 0)
  loop:
    z = sqr(z) * z + z * (q - 1) - q
  bailout:
    |z| <= 4
}
