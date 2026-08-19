; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_848e8cdc_d391_5098_9fdc_1de2f83be3f0 {
  init:
    z = pixel
  loop:
    sinZ = sin(z)
    cosZ = cos(z)
    z = z - sinZ / cosZ
  bailout:
    |z - zPrev| >= 0.000001
}