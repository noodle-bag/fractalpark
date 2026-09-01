; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_22d9a008_eb14_53de_9960_11eb5d37bb8e {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    clampedZ = z
    if imag(z) > 80
      imag(clampedZ) = 80
    elseif imag(z) < -80
      imag(clampedZ) = -80
    endif
    swirl = z + 0.28 * sin(clampedZ)
    rotCos = cos((0.55, 0))
    rotSin = sin((0.55, 0))
    rot = rotCos
    imag(rot) = real(rotSin)
    z = round((swirl * rot + c) * 16) / 16
  bailout:
    |z| <= 256
}