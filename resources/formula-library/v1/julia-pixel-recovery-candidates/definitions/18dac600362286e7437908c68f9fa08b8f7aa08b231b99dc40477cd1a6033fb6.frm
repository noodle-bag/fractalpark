; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_909f3ac5_9bc2_5e0a_835f_f4f73b1da23f {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      f = 1 / cos(pixel)
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