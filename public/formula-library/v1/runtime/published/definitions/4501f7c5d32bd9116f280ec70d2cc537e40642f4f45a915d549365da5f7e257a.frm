; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c724efce_f10b_5d8c_848a_4c00698210a7 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(z * fn2(z)) + pixel
  bailout:
    |z| <= t
}