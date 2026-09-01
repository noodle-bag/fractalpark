; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bebc8626_5930_5034_a8d3_38c0e134fb1b {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
  init:
    cclassic = c
    z = real(pixel) + flip(imag(pixel) * p1)
    cclassic = p2 + p1 * real(pixel) + imag(pixel)
  loop:
    z = fn1(z) * cclassic
  bailout:
    |z| <= 64
}