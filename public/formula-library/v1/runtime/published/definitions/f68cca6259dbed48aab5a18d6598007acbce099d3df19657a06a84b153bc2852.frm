; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a866079c_332f_5e5d_aba0_ae0512627582 {
  init:
    cclassic = c
    z = 1 / pixel
    cclassic = z
  loop:
    z = sqr(z) + cclassic
  bailout:
    |z| <= 4
}