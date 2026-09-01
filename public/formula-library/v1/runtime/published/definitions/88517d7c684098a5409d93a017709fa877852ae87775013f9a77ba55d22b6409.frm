; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e92b4390_cc41_5e7d_9b25_53ac3ba3908d {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * z * (square * (16 * square - 20) + 5)
  bailout:
    |z| < 100
}
