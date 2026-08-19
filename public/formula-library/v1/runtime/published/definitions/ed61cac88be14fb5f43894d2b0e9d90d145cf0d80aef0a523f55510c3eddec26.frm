; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f02ad930_de3d_5aac_b19c_8a904a8ca72a {
  init:
    cclassic = c
    z = pixel
    cclassic = log(pixel)
  loop:
    z = sqr(z) + cclassic
  bailout:
    |z| <= 4
}