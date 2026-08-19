; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9b51d265_8603_5613_9b2a_938430309021 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
  init:
    cclassic = c
    z = real(pixel) + flip(imag(pixel) * p1)
    cclassic = p2 + p1 * real(pixel) + imag(pixel)
  loop:
    z = z ^ 2.502907875095 + cclassic
  bailout:
    |z| <= 100
}