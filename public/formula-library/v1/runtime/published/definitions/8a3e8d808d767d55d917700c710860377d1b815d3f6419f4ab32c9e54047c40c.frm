; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
joz {
  parameters:
    seed: complex = (0, 0) classic p1
    drift: complex = (0, 0) classic p2
  init:
    z = pixel
    state = seed
  loop:
    z = sqr(z) + state
    state = state + drift / z
  bailout:
    |z| <= 4
}
