; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1a6253b6_de0e_5a0b_9028_f6db40da8fa7 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (z * (z - 4) + 2) / 2 + offset
  bailout:
    |z| < 100
}
