; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c64fd5e1_77f7_5b37_bafa_e5da99a5e22d {
  init:
    cclassic = c
    z = pixel
  loop:
    cclassic = sqr(pixel) / z
    cclassic = z + cclassic
    z = sqr(cclassic)
  bailout:
    |z| < 4
}