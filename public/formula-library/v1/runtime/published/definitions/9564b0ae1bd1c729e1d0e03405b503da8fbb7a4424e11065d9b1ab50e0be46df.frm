; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_47c9fe8a_3476_5f65_a063_62638c2e6069 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(conj(z)) * conj(z) + offset
  bailout:
    |z| <= 4
}
