; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bf323001_5e0b_51a6_8d04_f0102ef740a9 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * (square * (square - 4) + 2)
  bailout:
    |z| < 100
}
