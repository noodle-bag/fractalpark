; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9523e03d_c417_590e_8d03_ebaabe392327 {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      f = 1 / sinh(pixel)
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