; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ea4eaa45_ff53_5a7d_af21_690a58118510 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * z * (square * (square - 5) + 5)
  bailout:
    |z| < 100
}
