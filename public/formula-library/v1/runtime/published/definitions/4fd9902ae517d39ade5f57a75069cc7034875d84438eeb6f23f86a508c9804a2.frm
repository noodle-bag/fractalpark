; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3d70a4c8_af83_58ad_9985_326f1412ef5d {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(fn2(z ^ pixel))
  bailout:
    |z| <= t
}