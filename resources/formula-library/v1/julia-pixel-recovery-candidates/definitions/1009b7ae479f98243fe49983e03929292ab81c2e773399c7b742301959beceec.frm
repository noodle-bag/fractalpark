; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_bd3cabb7_66ad_5b86_a8d9_547d8eaeffc4 {
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
    z = sinh(z) + offsetValue
  bailout:
    |z| <= 50
}