; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log
Formula_f978281a_4cea_5545_a9c6_7ca68ca084f0 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
    y = fn1(z)
    base = log(p1)
  loop:
    z = fn2(y * log(z) / base)
  bailout:
    |z| <= 4
}