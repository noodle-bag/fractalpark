; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0e01b854_3b21_56f8_8310_3fa32ec2af99 {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      f = cos(pixel) / sin(pixel)
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