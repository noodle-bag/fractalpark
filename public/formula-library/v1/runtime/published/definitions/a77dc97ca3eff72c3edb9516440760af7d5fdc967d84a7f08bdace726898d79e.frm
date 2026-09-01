; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Quadrants {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = 0
    carrier = pixel
  loop:
    z = z * z + carrier
    horizontal = real(z)
    vertical = imag(z)
    rotation = (0, 0)
    if horizontal > 0
      if vertical > 0
        rotation = (0, 1)
      endif
      if vertical < 0
        rotation = (1, 0)
      endif
    endif
    if horizontal < 0
      if vertical > 0
        rotation = (-1, 0)
      endif
      if vertical < 0
        rotation = (0, -1)
      endif
    endif
    carrier = carrier + rotation * offset / z
  bailout:
    |z| <= 4
}
