; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8eb342fe_8a05_524e_8b98_35cdc8af5be3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    piZ = 3.14159 * z
    clampedPiZ = piZ
    if imag(piZ) > 80
      imag(clampedPiZ) = 80
    elseif imag(piZ) < -80
      imag(clampedPiZ) = -80
    endif
    cosPiZ = cos(clampedPiZ)
    term = (1 + 2 * z) * cosPiZ
    z = round(((1 + 4 * z - term) / 4 + c) * 16) / 16
  bailout:
    |z| <= 256
}