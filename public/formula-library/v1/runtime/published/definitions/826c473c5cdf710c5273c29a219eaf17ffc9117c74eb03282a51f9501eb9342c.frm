; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_62098934_def3_527a_ac43_2c80449c9848 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    clampedZ = z
    if real(z) > 80
      real(clampedZ) = 80
    elseif real(z) < -80
      real(clampedZ) = -80
    endif
    z = round(c * cosh(clampedZ) * 16) / 16
  bailout:
    |z| <= 256
}