; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_70b6af5a_8da1_5403_8039_d5b475f48248 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = fn1(pixel)
  loop:
    z = p1 * fn2(z) ^ 2 + p2
  bailout:
    |z| <= 4
}