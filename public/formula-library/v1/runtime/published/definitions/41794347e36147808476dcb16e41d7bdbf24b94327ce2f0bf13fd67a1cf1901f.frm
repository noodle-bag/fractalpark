; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0109434e_e9cc_5d80_ad3f_d25ec62cbfda {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(z) * pixel * fn2(fn3(z) * pixel)
  bailout:
    |z| <= t
}