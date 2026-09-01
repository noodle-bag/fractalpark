; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9523e03d_c417_590e_8d03_ebaabe392327 {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    f = 1 / sinh(pixel)
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}