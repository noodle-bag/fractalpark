; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2380f8fa_cae0_56b1_baab_63bd8e2ccf85 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
  init:
    cclassic = c
    z = real(pixel) + flip(imag(pixel) * p1)
    cclassic = p2 + p1 * real(pixel) + imag(pixel)
  loop:
    z = z * z + cclassic
  bailout:
    |z| <= 64
}