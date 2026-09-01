; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cefe7738_0e8a_547f_ac85_ac3db2529907 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    if ismand
      carrier = pixel
    else
      carrier = c
    endif
    z = (0.5, 0)
    if !ismand
      z = pixel
    endif
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    nextX = -carrier * (xCoord - xCoord * xCoord + yCoord * yCoord) + offset
    twist = -carrier * (yCoord - 2 * xCoord * yCoord)
    z = nextX + flip(twist)
  bailout:
    |z| <= 100
}