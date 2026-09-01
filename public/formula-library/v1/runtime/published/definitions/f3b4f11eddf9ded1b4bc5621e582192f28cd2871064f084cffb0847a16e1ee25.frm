; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7f899f9c_1f66_5864_8fb1_48135bb269ed {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    cclassic = c
    z = pixel
    cclassic = fn1(pixel)
  loop:
    z = z ^ z / fn2(z)
    z = cclassic / z
  bailout:
    |z| <= 5 + p1
}