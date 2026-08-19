; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_73a3c993_2317_53e1_9cfa_836aaf906859 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    cclassic = c
    z = 0
    cclassic = fn1(pixel)
  loop:
    z = fn2(z) + cclassic
  bailout:
    |z| <= 5 + p1
}