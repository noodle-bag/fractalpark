; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_274e03a7_1442_5d59_a18f_72f5f23b5e1a {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = p1 * fn1(z) + p1 * p1 * fn2(p2 * z) + pixel
  bailout:
    |z| <= 100
}