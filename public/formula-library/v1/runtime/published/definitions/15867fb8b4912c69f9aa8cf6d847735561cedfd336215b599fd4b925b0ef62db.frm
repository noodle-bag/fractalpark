; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d170fae4_0295_5149_84e8_acf7254c7162 {
  init:
    seed = pixel
    z = (0, 0)
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    squarePart = xCoord * xCoord - yCoord * yCoord
    crossPart = (2 * xCoord) * yCoord
    z = squarePart + crossPart + seed
  bailout:
    |z| < 4
}
