; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_a0295fbb_2275_53db_b59d_c969cd722c8c {
  parameters:
    seed: complex = (0, 0) classic p1
    threshold: complex = (0, 0) classic p2
    numeratorMap: function = identity classic fn1
    denominatorMap: function = identity classic fn2
    finalMap: function = identity classic fn3
  init:
    z = seed
    magnitude = |z|
  loop:
    z = numeratorMap(z) / denominatorMap(z) + pixel
    z = finalMap(z) + pixel
    magnitude = |z|
  bailout:
    magnitude <= real(threshold)
}
