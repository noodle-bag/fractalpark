; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_34678277_c72d_5f9e_a192_f3bdfea6907d {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    z = fn1(pixel)
  loop:
    z = p1 * fn2(z) ^ 2 + p2 * fn3(z) ^ 2 + pixel
  bailout:
    |z| <= 4
}