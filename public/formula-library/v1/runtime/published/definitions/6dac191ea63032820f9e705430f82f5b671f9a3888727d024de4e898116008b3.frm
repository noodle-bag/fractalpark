; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_82fb9306_8444_58a1_a86e_c4794093d7ed {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(conj(z)) + conj(constant)
  bailout:
    |z| <= 4
}
