; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6bd676b3_4d37_597d_b780_b6028c91e3dc {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
  init:
    cclassic = c
    z = p1 * real(pixel) + imag(pixel)
    cclassic = p2 + real(pixel) + flip(imag(pixel) * p1)
  loop:
    z = fn1(z) * cclassic
  bailout:
    |z| <= 64
}