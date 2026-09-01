; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
jfnz {
  parameters:
    seed: complex = (0, 0) classic p1
    drift: complex = (0, 0) classic p2
    transform: function = identity classic fn1
  init:
    z = pixel
    state = seed
  loop:
    z = sqr(z) + state
    state = state + drift * transform(z)
  bailout:
    |z| <= 4
}
