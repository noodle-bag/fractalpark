; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f9a6409b_130b_5dd5_be4f_789927e47ad2 {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    square = sqr(z)
    z = carrier * (square * (8 * square + 8) + 1)
  bailout:
    |z| < 100
}
