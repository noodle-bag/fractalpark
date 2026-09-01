; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b88a02e9_0ef5_5a1a_932a_d2edc968a7ca {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    nextReal = ((-4) * xCoord) * yCoord + offset
    yCoord = (4 * yCoord) * yCoord - xCoord * xCoord
    z = nextReal + yCoord
  bailout:
    |z| <= 4
}
