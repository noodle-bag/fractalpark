; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_dd5a6937_3b00_5bc9_8c18_5d048471126e {
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
    z = sinh(z) + offsetValue
  bailout:
    |z| <= 50
}