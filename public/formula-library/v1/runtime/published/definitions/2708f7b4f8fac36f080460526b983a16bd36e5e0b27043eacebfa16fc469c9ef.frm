; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_3d5c83f1_a31b_55d3_b0a9_c17cb5737d5e {
  parameters:
    cubicScale: complex = (0, 0) classic p1
  init:
    z = 2 * (1 - pixel) / (3 * cubicScale)
  loop:
    z = cubicScale * z * z * z + (pixel - 1) * z * z - pixel
  bailout:
    |z| <= 100
}
