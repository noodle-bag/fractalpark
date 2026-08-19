; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c6c4669e_c6f6_5867_990e_8d650b34bc53 {
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
    x1 = -fn1(const_ - 12 * x) * x / (4 * const_)
    y1 = -fn2(const_ + 12 * x) * y / (4 * const_)
    x2 = x1 * x1 - y1 * y1 + p1
    y2 = 2 * x * y
    z = x2 + y2
  bailout:
    |z| <= 100
}