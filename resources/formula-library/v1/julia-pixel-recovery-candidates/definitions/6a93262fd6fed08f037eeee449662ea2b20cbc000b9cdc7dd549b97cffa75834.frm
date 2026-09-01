; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_e89afab6_33b1_5cd2_bfc0_98b2dfca400e {
  init:
    z = pixel
    if ismand
      offsetValue = cosxx(pixel)
    else
      offsetValue = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sin(z) + offsetValue
  bailout:
    |z| <= 50
}