; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_564827f6_4abd_5360_aec3_75e800b499ab {
  init:
    z = pixel
    if ismand
      offset = exp(pixel)
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