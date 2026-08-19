; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c2a51dc4_1d42_5d4e_ad5b_5ffe960c5f50 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (z * (z * (z * (z * (z * (z - 36) + 450) - 2400) + 5400) - 4320) + 720) / 720 + offset
  bailout:
    |z| < 100
}
