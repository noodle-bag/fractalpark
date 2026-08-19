; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fd4db987_1bd3_5ab0_983f_9a9bb01d0304 {
  parameters:
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    cclassic = c
    x = 1 / pixel
    z = x
    cclassic = fn1(z)
  loop:
    z = x ^ 3 - cclassic ^ 3
    x = fn2(z)
  bailout:
    |z| <= 3
}