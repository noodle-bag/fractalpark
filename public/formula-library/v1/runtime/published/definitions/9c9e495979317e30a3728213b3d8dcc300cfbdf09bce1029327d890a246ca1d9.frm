; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fbde208b_8c88_5d55_8e5a_ecac4245add1 {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    z = seed
    magnitude = |z|
  loop:
    z = firstTransform(z) + pixel
    z = secondTransform(z) + pixel
    magnitude = |z|
  bailout:
    |z| <= real(limit)
}
