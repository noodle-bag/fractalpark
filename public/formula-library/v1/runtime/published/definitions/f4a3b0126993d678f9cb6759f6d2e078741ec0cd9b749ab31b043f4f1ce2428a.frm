; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bb186688_4571_5725_a8ed_a17e0100dbc8 {
  init:
    z = pixel
  loop:
    clampedZ = z
    if real(z) > 20
      real(clampedZ) = 20
    elseif real(z) < -20
      real(clampedZ) = -20
    endif
    expZ = exp(clampedZ)
    z = z - (1, 0) + (1, 0) / expZ
  bailout:
    |z - zPrev| >= 0.000001
}