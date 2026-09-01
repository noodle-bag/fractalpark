; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_df1c8979_3e38_5868_87ee_4f2e2a460b72 {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    square = sqr(z)
    z = carrier * z * (square * (16 * square - 20) + 5)
  bailout:
    |z| < 100
}
