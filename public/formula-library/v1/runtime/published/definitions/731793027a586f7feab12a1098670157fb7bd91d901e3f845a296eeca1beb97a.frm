; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f0680a59_42e8_52e4_8444_a1b4026d87b6 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * (square * (square * (square - 5) + 6) - 1)
  bailout:
    |z| < 100
}
