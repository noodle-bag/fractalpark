; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4424528d_f0a1_58e5_938e_560b39d58fff {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
  init:
    cclassic = c
    z = real(pixel) + p1 * imag(pixel)
    cclassic = p2 + p1 * real(pixel) + imag(pixel)
  loop:
    z = fn1(z) + cclassic
  bailout:
    |z| <= 64
}