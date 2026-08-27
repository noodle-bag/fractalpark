; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5d0877c0_5f84_5c3b_9466_b9f9b417cb6a {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      f = cosh(pixel) / sinh(pixel)
    else
      f = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}