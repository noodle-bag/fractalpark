; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_4827faca_8ea6_5d14_8a05_a2cbef5c8971 {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    conditionalTransform: function = sin classic fn1
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
