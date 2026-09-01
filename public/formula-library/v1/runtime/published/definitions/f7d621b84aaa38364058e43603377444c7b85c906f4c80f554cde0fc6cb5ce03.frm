; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_16add0c8_8818_5127_9e53_c429c673e127 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(sqr(conj(z))) + offset
  bailout:
    |z| <= 4
}
