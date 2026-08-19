; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d68394df_e4bf_5004_9605_89f14ff00e93 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(fn2(fn3(z) * pixel)) + pixel
  bailout:
    |z| <= t
}