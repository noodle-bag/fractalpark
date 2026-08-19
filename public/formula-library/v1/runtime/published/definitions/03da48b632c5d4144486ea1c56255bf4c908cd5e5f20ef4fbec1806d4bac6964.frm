; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9b437c43_72bc_51a3_8b61_227f916d724c {
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
    z = c * sinh(clampedZ)
  bailout:
    |z| <= 256
}