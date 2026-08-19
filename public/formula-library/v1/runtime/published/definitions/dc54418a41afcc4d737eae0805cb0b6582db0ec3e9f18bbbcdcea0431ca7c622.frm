; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2b3b3de9_9e48_5b8e_9f65_97eefdf642fb {
  parameters:
    increment: complex = (0, 0) classic p1
    cutoff: complex = (0, 0) classic p2
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + increment * (|z| <= cutoff)
  bailout:
    |z| <= 4
}
