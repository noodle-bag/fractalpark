; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d89f722f_35fe_587a_bee9_efdf05885728 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    clampedZ = z
    if real(z) > 8
      real(clampedZ) = 8
    elseif real(z) < -8
      real(clampedZ) = -8
    endif
    stableCosh = round(cosh(clampedZ) * 16) / 16
    stableSinh = round(sinh(clampedZ) * 16) / 16
    z = round((stableCosh * stableSinh + c) * 16) / 16
  bailout:
    |z| <= 256
}