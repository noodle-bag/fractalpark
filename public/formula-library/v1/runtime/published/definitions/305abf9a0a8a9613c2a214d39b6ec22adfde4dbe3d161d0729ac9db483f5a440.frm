; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f031c5ee_cb45_5389_80ed_1c5365a12e02 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = fn1(p1 + z) * fn2(p2 - z)
  bailout:
    |z| <= p2 + 16
}