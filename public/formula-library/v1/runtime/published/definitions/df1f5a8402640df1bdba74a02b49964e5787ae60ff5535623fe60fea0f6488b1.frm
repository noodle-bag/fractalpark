; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f50a14b0_7031_5d9a_a9b8_f7bdee1b69a2 {
  parameters:
    threshold: complex = (0, 0) classic p1
  init:
    z = pixel
    baseReal = real(pixel)
    baseImag = imag(pixel)
    root = (0, -1) ^ 0.5
  loop:
    xCoord = real(z)
    yCoord = imag(z)
    radial = xCoord * xCoord + yCoord * yCoord + baseReal
    twisted = (0, -2) * xCoord * yCoord + baseImag
    z = radial + twisted * root
  bailout:
    |z| < real(threshold)
}
