; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_2eec1b15_ca6a_5817_bba6_8766396b3d18 {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    conditionalTransform: function = cosh classic fn1
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
