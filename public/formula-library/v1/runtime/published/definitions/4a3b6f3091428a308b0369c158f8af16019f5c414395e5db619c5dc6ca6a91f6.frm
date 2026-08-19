; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_9915da24_f5e1_539c_84b2_4924d52efbb7 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    nextX = (-sin(xCoord)) * cosh(yCoord) + offset
    nextY = (-cos(xCoord)) * sinh(yCoord)
    z = nextX + flip(nextY)
  bailout:
    |z| <= 100
}
