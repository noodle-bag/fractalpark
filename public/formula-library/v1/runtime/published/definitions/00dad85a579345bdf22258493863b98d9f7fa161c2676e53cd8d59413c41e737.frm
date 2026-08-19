; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_dbdc62ab_2298_5f9a_9479_47f2b6d920d5 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
    function4: function = identity classic fn4
  init:
    z = pixel
    cx = fn1(real(z))
    cy = fn2(imag(z))
    k = 2 + p1
  loop:
    zx = real(z)
    zy = imag(z)
    x = fn3(zx * zx - zy * zy) + cx
    y = fn4(k * zx * zy) + cy
    z = x + flip(y)
  bailout:
    |z| < 10 + p2
}