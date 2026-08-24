; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9f301c01_13fa_57b4_a3b2_99add821bfb0 {
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
    z = round((cos(clampedZ) + c) * 16) / 16
  bailout:
    |z| <= 256
}