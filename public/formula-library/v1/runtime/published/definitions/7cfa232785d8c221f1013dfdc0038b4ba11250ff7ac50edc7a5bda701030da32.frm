; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_18aa30c7_6c32_505f_be32_5c0bf438d151 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    x = real(z)
    y = imag(z)
    const_ = x * x + y * y
    x1 = -fn1(const_ + p1 * x) * y / const_
    y1 = -fn2(const_ + y) * x / const_
    x2 = x1 * x1 - y1 * y1 + p2
    y2 = 2 * x1 * y1
    z = x2 + flip(y2)
  bailout:
    |z| <= 100
}