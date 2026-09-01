; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_a7a97d42_4e18_5048_b5d9_65eb80cbdc60 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    sinhPart = sinh(xCoord) * cos(yCoord)
    coshPart = cosh(xCoord) * sin(yCoord)
    nextX = -2 * sinhPart * coshPart + offset
    nextY = coshPart * coshPart - sinhPart * sinhPart
    z = nextX + flip(nextY)
  bailout:
    |z| <= 100
}
