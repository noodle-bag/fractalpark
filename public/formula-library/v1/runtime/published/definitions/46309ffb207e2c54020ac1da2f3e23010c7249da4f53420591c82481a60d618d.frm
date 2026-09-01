; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_890ef186_8e18_5b9b_a928_b2b3f0b20e92 {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
  init:
    z = seed
    magnitude = |z|
  loop:
    z = firstTransform(z)
    z = secondTransform(z) + pixel
    magnitude = |z|
  bailout:
    |z| <= real(limit)
}
