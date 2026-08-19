; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_06504747_8ee8_5c39_869b_8b3a992e8c24 {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    z = seed
  loop:
    coordinate = real(z)
    z = firstTransform(z) + pixel
    z = secondTransform(z) - pixel
  bailout:
    |z| <= real(limit)
}
