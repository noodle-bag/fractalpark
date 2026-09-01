; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4c0559f7_9f60_51f4_b100_2ea5f1d330e8 {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      f = tanh(pixel)
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