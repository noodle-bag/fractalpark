; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c0dec4b4_5412_5c02_966a_612c56880508 {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    square = sqr(z)
    z = carrier * (square * (16 * square - 12) + 1)
  bailout:
    |z| < 100
}
