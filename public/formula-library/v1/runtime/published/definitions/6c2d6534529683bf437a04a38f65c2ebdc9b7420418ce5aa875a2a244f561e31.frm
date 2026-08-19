; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0ab98320_d82b_5b61_b491_7dc2d2b1fe03 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(z) * pixel * fn2(fn3(z))
  bailout:
    |z| <= t
}