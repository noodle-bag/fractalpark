; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_c5d5dfae_9f15_5529_8f10_042938047b7f {
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
