; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1cd7a16f_0474_5b8f_a974_e122ea893769 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
  init:
    cclassic = c
    z = real(pixel) + flip(imag(pixel) * p1)
    cclassic = p2 + p1 * real(pixel) + imag(pixel)
  loop:
    z = z ^ 2.71828182845905 + cclassic
  bailout:
    |z| <= 100
}