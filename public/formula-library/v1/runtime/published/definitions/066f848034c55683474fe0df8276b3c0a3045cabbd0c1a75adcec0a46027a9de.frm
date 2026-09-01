; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_44d9b35c_ed7c_51d6_8ee1_14e56f5ade7d {
  parameters:
    increment: complex = (0, 0) classic p1
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + increment
  bailout:
    |z| <= 4
}
