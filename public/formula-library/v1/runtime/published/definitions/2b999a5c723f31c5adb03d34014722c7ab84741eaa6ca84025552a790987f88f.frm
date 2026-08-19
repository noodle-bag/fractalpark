; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_16e44954_d897_5037_9c2e_2ad203c4207f {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    f = 1 / pixel
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}