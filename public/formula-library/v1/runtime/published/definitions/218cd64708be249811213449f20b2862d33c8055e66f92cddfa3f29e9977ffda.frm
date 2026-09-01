; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_25a44643_404e_5254_8cba_a1b639779fbb {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    cclassic = c
    z = pixel
    cclassic = fn1(pixel)
  loop:
    z = fn2(1 / (z + cclassic)) * fn3(z + cclassic)
  bailout:
    |z| <= p1
}