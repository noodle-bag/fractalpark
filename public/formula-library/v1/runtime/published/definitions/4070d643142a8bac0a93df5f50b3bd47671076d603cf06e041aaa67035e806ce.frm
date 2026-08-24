; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_190fa538_89c9_590f_8170_34b3c570fc5d {
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
    z = round((sinh(clampedZ) + c) * 16) / 16
  bailout:
    |z| <= 256
}