; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_596924fd_c7dd_51c5_891a_42406ee23fb6 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
    function4: function = identity classic fn4
  init:
    z = pixel
    cx = fn1(real(pixel))
    cy = fn2(imag(pixel))
    k = 3 + p1
  loop:
    zx = real(z)
    zy = imag(z)
    x = fn3(zx * zx * zx - k * zx * zy * zy) + cx
    y = fn4(k * zx * zx * zy - zy * zy * zy) + cy
    z = x + flip(y)
  bailout:
    |z| < 4 + p2
}