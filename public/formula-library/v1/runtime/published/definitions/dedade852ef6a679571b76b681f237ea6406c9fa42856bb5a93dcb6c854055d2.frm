; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_35750620_a4a0_5454_b03b_18df45ddd0f4 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(sqr(z)) + conj(offset)
  bailout:
    |z| <= 4
}
