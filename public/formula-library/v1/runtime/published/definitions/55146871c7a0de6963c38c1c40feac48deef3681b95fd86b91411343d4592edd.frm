; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0e58167e_79e1_56f9_86f7_149737fcfaea {
  init:
    z = pixel
  loop:
    z = z ^ pixel + pixel ^ z
  bailout:
    |z| <= 96
}
