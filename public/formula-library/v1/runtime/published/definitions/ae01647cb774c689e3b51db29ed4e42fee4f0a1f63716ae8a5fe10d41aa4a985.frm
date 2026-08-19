; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0e1b1705_ae4c_5685_b0fc_b82586ff144e {
  parameters:
    multiplier: complex = (0, 0) classic p1
    thresholdOffset: complex = (0, 0) classic p2
    initialMap: function = identity classic fn1
    orbitMap: function = identity classic fn2
  init:
    z = pixel
    addition = initialMap(pixel) * multiplier
    limit = 10 + thresholdOffset
  loop:
    horizontal = abs(real(z))
    vertical = abs(imag(z))
    if horizontal <= vertical
      z = orbitMap(z) + vertical + addition
    else
      z = orbitMap(z) + horizontal + addition
    endif
  bailout:
    LastSqr <= real(limit) * real(limit)
}
