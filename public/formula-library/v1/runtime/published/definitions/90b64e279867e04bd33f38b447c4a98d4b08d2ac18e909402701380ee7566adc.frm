; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_32542eeb_e9fe_5c0f_9414_b00f98c03709 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    z = pixel
    t = p1 + 4
  loop:
    z = fn1(z) * pixel * fn2(fn3(z) + pixel)
  bailout:
    |z| <= t
}