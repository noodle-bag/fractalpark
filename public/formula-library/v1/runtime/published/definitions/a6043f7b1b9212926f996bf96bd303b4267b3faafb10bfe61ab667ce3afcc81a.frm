; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9068c579_4fc9_57bb_99a7_4e86d15dc55b {
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
    |z| <= 4
}