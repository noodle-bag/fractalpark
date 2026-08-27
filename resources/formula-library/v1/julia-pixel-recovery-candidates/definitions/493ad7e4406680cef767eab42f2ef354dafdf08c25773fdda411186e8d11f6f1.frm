; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_8cde6ebb_f5cc_577e_8abc_9e4d20c1d994 {
  init:
    z = pixel
    if ismand
      offsetValue = cotanh(pixel)
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