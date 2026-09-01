; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_579c54b7_c055_53fa_86a9_104f8f69752d {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = (sqr(z) * (sqr(z) * (231 * sqr(z) - 315) + 105) - 5) / 16 + q
  bailout:
    |z| < 100
}
