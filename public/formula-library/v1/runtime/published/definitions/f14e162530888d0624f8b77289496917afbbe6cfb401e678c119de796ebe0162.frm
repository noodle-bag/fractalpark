; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f36b3c6f_8676_55c3_8d21_6413d7db848f {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
  init:
    cclassic = c
    z = p1 * real(pixel) + imag(pixel)
    cclassic = p2 + real(pixel) + flip(imag(pixel) * p1)
  loop:
    z = z * z + cclassic
  bailout:
    |z| <= 64
}