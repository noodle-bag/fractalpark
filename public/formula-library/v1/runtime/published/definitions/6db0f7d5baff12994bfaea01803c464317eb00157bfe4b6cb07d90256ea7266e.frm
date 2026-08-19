; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bb1b85d1_ea8d_5439_a808_be19afcabb30 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * z * (square * (square * (square - 7) + 14) - 7)
  bailout:
    |z| < 100
}
