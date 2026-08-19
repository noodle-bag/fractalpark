; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_805b4a5b_0ac9_5a3e_b589_1cdd1df06075 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = (z * (z * (z * (z - 16) + 72) - 96) + 24) / 24 + q
  bailout:
    |z| < 100
}
