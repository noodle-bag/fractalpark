; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f876a613_3cb0_58ac_b124_f2985773809f {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(fn2(fn3(z ^ z * pixel)))
  bailout:
    |z| <= t
}