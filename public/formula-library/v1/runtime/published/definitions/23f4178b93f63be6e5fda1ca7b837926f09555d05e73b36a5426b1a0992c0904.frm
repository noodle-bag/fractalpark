; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1ac85fe0_8fcb_557d_abf4_5a71bfcea5e5 {
  parameters:
    offset: complex = (0, 0) classic p1
    exponentValue: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = conj(z) ^ exponentValue + conj(offset)
  bailout:
    |z| <= 4
}
