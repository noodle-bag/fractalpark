; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9693612f_d5c2_5d77_9058_58ee16e14b4b {
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
    z = c * sin(clampedZ)
  bailout:
    |z| <= 256
}