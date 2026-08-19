; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_1f5b5a3a_0b63_527a_a408_e7b45d377cb2 {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    conditionalTransform: function = tanh classic fn1
    orbitTransform: function = sqr classic fn2
  init:
    z = seed
    magnitude = |z|
  loop:
    if 1 < magnitude
      z = conditionalTransform(z) + pixel
    endif
    z = orbitTransform(z) + pixel
    magnitude = |z|
  bailout:
    |z| <= real(limit)
}
