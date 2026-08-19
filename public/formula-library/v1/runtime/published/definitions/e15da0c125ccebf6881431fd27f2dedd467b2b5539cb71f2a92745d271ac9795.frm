; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3773f101_06b1_5e58_bdb7_708853997f30 {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = scale * (z * z * (z * z * (32 * z * z - 48) + 18) - 1)
  bailout:
    |z| < 100
}
