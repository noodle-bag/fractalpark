; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ad3fb2d1_4157_51aa_8576_2fb203e4747a {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    square = sqr(z)
    z = carrier * z * (square * (square * (128 * square - 192) + 80) - 8)
  bailout:
    |z| < 100
}
