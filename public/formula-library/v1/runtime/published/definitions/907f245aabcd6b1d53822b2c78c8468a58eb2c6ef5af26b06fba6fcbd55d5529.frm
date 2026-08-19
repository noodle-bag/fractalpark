; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b8b69fda_a887_58b0_995a_8343f768477e {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(conj(z)) + offset
  bailout:
    |z| <= 4
}
