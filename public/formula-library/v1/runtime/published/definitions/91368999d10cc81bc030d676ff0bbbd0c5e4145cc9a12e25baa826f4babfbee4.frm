; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_a2b483f2_1066_54e6_8e28_c22f6983975a {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    sinePart = sin(xCoord) * cosh(yCoord)
    cosinePart = cos(xCoord) * sinh(yCoord)
    nextX = -2 * sinePart * cosinePart + offset
    nextY = cosinePart * cosinePart - sinePart * sinePart
    z = nextX + flip(nextY)
  bailout:
    |z| <= 100
}
