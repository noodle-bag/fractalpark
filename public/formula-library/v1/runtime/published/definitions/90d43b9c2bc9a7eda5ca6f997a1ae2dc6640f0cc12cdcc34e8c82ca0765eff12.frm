; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_201c54f3_a77a_5be0_a0a5_6f4f1998ee6d {
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
    stableCosh = round(cosh(clampedZ) * 16) / 16
    z = round((stableCosh + c) * 16) / 16
  bailout:
    |z| <= 256
}