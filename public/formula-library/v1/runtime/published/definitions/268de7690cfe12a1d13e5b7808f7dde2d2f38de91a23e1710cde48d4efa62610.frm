; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_dd0517c2_73c1_55c6_aee7_5cd72c2cdc4e {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * (square * (square - 3) + 1)
  bailout:
    |z| < 100
}
