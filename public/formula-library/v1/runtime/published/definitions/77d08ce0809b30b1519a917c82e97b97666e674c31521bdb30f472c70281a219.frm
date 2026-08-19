; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e2ced79d_211e_55e0_89c1_558d261133e6 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    x = real(z)
    y = imag(z)
    const_ = x * x + y * y
    x1 = -fn1((const_ - x) * x / const_)
    y1 = -fn2((const_ + y) * y / const_)
    x2 = x1 * x1 - y1 * y1 + p1
    y2 = 2 * x1 * y1
    z = x2 + flip(y2)
  bailout:
    |z| <= 100
}