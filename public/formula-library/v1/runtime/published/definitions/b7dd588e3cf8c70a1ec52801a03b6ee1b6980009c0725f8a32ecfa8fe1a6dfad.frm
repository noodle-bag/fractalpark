; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a569d2c4_d397_5634_9dfe_21b2ab1a386a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    x2 = abs(real(z)) * abs(real(z))
    y2 = abs(imag(z)) * abs(imag(z))
    nextZ = (0, 0)
    real(nextZ) = x2 - y2
    imag(nextZ) = 2 * real(z) * abs(imag(z))
    z = nextZ + c
  bailout:
    |z| <= 256
}