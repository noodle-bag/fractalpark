; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e84e8cee_b68f_5494_b098_a7b7a7237705 {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    square = sqr(z)
    z = carrier * (square * (square - 4) + 2)
  bailout:
    |z| < 100
}
