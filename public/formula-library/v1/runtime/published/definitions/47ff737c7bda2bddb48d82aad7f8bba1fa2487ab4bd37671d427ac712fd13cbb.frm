; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_044d9b5f_6ead_5aa6_93c9_19d60c2e97eb {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
  init:
    cclassic = c
    cclassic = pixel
    z = cclassic
    k = 2 + p1
  loop:
    zx = real(z)
    zy = imag(z)
    cx = real(cclassic)
    cy = imag(cclassic)
    x = fn1(zx * zx - zy * zy) + cx
    y = fn2(k * zx * zy) + cy
    z = x + flip(y)
    cclassic = fn3((cx + cy) / k) + z
  bailout:
    |z| < 10 + p2
}