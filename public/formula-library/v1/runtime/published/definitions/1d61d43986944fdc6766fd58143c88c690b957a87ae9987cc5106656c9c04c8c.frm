; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_445e20a5_2d78_56e2_9741_8429545ecb5e {
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
    z = fn1(fn2(fn3(fn4(z) * pixel)))
  bailout:
    |z| <= t
}