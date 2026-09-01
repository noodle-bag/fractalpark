; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d090c254_4d6e_5d89_b8b6_3345c59b2a89 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (z * (z * (z * (z - 16) + 72) - 96) + 24) / 24 + offset
  bailout:
    |z| < 100
}
