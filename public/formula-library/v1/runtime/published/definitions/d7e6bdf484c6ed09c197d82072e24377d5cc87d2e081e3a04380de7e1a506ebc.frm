; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_de8106f4_22ce_567c_a1c7_e299a8d4a878 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
    function4: function = identity classic fn4
  init:
    z = pixel
    p1x = real(p1) + 1
    p1y = imag(p1) + 1
    p2x = real(p2) + 1
    p2y = imag(p2) + 1
  loop:
    zx = real(z)
    zy = imag(z)
    x = fn1(zx * p1x - zy * p1y) + fn2(zx * p2x - zy * p2y)
    y = fn3(zx * p1y + zy * p1x) + fn4(zx * p2y + zy * p2x)
    z = x + flip(y)
  bailout:
    |z| <= 20
}