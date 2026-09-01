; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0672aed0_1fd1_5acd_9263_a52d5680d3b4 {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    f = 1 / cosh(pixel)
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}