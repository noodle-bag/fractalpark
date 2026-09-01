; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a89891b1_8ccb_5d58_9fbb_05944b85ce3c {
  init:
    z = pixel
    if |z| < 0.00001
      z = (0.2, 0)
    endif
  loop:
    clampedZ = z
    if real(z) > 80
      real(clampedZ) = 80
    elseif real(z) < -80
      real(clampedZ) = -80
    endif
    denom = sinh(clampedZ)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      z = z
    else
      z = z - (cosh(clampedZ) - (1, 0)) / denom
    endif
  bailout:
    |z - zPrev| >= 0.000001
}