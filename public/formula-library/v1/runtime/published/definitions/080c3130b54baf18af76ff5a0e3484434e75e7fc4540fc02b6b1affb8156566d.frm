; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6bcf077e_6f30_5f3f_9ae8_4cf5d3fb4020 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = (z * z - 1) / (z * z + 2) * fn1(z) * fn2(z) + p1
  bailout:
    |z| <= 100
}