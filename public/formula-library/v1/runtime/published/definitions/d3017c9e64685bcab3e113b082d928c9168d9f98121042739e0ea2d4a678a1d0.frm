; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_834e2e45_7622_5f87_b825_b0bcfc15cfe2 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(fn2(z)) + pixel
  bailout:
    |z| <= t
}