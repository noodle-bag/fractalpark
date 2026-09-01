; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_f6126a12_f689_5eac_8917_71580950caba {
  init:
    z = pixel
    if ismand
      offsetValue = exp(pixel)
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