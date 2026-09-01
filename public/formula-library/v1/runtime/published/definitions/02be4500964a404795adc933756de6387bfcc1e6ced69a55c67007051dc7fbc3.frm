; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c9c7f540_acdd_5092_8132_02ddf980daa7 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    z = (z * (z * (-z + 9) - 18) + 6) / 6 + carrier
  bailout:
    |z| < 100
}
