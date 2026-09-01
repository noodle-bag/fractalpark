; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_88887758_7d89_5be3_b0ef_6cdbdc9f5825 {
  init:
    z = pixel
    if ismand
      offset = pixel ^ (1 / cosxx(pixel))
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}