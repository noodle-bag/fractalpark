; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_c5c8d6cd_3d5a_565d_90c4_f1b7572f9b71 {
  init:
    z = pixel
    if ismand
      offsetValue = sqr(pixel)
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