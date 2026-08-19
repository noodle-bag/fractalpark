; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e528748d_efea_5745_99f5_a2ed96f7d86b {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = z * z * z * z * (carrier - 1) - carrier
  bailout:
    |z| <= 4
}
