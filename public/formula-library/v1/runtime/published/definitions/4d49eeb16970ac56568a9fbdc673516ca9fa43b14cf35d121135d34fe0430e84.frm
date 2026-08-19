; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_77ca142c_a2c6_568d_acbd_2b4dde8c7e89 {
  init:
    cclassic = c
    z = pixel
  loop:
    cclassic = sqr(pixel) / z
    cclassic = z + cclassic
    z = sqr(cclassic * pixel)
  bailout:
    |z| < 4
}