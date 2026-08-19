; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4c8382ac_ee39_5f57_87e7_7314d1dca9d2 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = fn1(1 / (z + p1)) * fn2(z + p1)
  bailout:
    |z| <= p2
}