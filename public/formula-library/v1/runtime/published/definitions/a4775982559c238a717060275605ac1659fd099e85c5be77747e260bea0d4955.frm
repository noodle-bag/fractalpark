; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cc100ec7_53ba_58c3_9471_03c3188bbaef {
  parameters:
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
    function4: function = identity classic fn4
  init:
    cclassic = c
    z = 1 / pixel
    cclassic = z
  loop:
    z = fn1(z) * fn2(z) + fn3(fn4(cclassic))
  bailout:
    |z| <= 4
}