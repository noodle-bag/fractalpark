; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_c523ec02_e1a2_52b5_a8a9_bada5fccae6f {
  parameters:
    seed: complex = (0, 0) classic p1
    firstMap: function = identity classic fn1
    numeratorMap: function = identity classic fn2
    denominatorMap: function = identity classic fn3
  init:
    z = seed
    roundCount = 1
  loop:
    z = firstMap(z) + pixel
    z = numeratorMap(z) / denominatorMap(z) + pixel
    roundCount = roundCount + 1
  bailout:
    |z| <= 4
}
