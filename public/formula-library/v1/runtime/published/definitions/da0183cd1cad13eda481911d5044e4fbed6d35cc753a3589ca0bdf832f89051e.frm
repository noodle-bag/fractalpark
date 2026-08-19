; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c2bcb574_f9c9_56c7_bc74_86c3818b2a6e {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    square = sqr(z)
    z = (z * (square * (63 * square - 70) + 15)) / 8 + offset
  bailout:
    |z| < 100
}
