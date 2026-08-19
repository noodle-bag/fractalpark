; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f3cd0dda_37c9_5d2e_8103_9b2a7ee25c53 {
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
    x1 = -fn1((const_ - 12 * x) * x / (4 * const_))
    y1 = -fn2((const_ + 12 * y) * y / (4 * const_))
    x2 = x1 * x1 - y1 * y1 + p1
    y2 = 2 * x1 * y1
    z = x2 + flip(y2)
  bailout:
    |z| <= 100
}