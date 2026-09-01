; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_34246d25_1aa2_5f1e_b37e_fc442b3ad9a6 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
    function4: function = identity classic fn4
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(fn2(z) * pixel * fn3(fn4(z) * pixel))
  bailout:
    |z| <= t
}