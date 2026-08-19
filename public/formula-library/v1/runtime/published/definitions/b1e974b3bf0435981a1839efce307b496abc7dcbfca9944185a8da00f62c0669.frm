; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d3aba0c4_e0db_57c9_a0e0_78894ad0b2e6 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(sqr(conj(z))) + conj(offset)
  bailout:
    |z| <= 4
}
