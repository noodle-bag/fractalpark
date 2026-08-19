; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_32d004cc_c75b_5242_b08a_202a8f378a8d {
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
    f2 = fn2(z)
    z = fn1(f2) * fn3(fn4(f2)) * pixel
  bailout:
    |z| <= t
}