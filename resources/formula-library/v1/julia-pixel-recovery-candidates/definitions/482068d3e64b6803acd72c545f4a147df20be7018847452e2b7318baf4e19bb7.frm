; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_fdbbc343_f4c3_5eb4_94de_f5a1d9ef2525 {
  init:
    z = pixel
    if ismand
      offsetValue = pixel ^ sinh(pixel)
    else
      offsetValue = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}