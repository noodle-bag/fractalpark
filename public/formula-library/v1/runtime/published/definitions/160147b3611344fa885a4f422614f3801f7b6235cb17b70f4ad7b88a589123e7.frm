; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f9cfda9b_5757_5fa2_bd63_ca10c88a7295 {
  parameters:
    threshold: complex = (0, 0) classic p1
  init:
    z = pixel
    baseReal = real(pixel)
    baseImag = imag(pixel)
    root = (0, 1) ^ 0.5
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    radial = xCoord * xCoord + yCoord * yCoord + baseReal
    twisted = (0, 2) * xCoord * yCoord + baseImag
    z = radial + twisted * root
  bailout:
    |z| < real(threshold)
}
