; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
jc {
  parameters:
    seed: complex = (0, 0) classic p1
    rate: complex = (0, 0) classic p2
  init:
    z = pixel
    state = seed
  loop:
    z = sqr(z) + state
    state = state + rate * state
  bailout:
    |z| <= 4
}
