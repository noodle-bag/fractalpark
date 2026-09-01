; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_8a01fc8e_1b68_5db5_85dd_6eebb78dacf5 {
  init:
    z = pixel
    if ismand
      offset = sin(pixel)
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sinh(z) + offset
  bailout:
    |z| <= 50
}