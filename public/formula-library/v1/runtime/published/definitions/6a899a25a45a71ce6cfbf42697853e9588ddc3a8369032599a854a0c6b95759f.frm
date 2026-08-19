; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9e7250d0_f815_521a_9cf6_6c4d68598b2c {
  parameters:
    rate: complex = (0, 0) classic p1
    offset: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    a = real(z)
    b = imag(z)
    g1 = -rate * (a - a * a + b * b) + offset
    g2 = -rate * (b - 2 * a * b)
    z = g1 + flip(g2)
  bailout:
    |z| <= 100
}
