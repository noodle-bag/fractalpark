; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_165d6b06_a4b2_53fe_bac1_07a6fc2ab142 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (z * z * (z * z * (231 * z * z - 315) + 105) - 5) / 16 + offset
  bailout:
    |z| < 100
}
