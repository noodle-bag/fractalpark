; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
flip1_man_j {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    z = pixel
    state = seed
  loop:
    state = flip(state)
    z = sqr(z) + state
  bailout:
    |z| <= 4
}
