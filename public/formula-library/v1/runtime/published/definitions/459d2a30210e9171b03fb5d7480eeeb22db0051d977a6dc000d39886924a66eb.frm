; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_14d3cb89_d3e7_5bff_b848_af88c9a561ae {
  parameters:
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    cclassic = c
    x = 1 / pixel
    z = x
    cclassic = fn1(z)
  loop:
    z = (x + cclassic) * (x - cclassic)
    x = fn2(z)
  bailout:
    |z| <= 3
}