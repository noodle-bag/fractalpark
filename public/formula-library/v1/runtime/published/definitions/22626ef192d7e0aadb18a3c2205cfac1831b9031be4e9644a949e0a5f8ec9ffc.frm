; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8f8f2d09_9907_5cde_b1e2_93aa88caaa24 {
  init:
    cclassic = c
    z = 1 / pixel
    cclassic = z
  loop:
    z = sqr(z) + cclassic
  bailout:
    |z| <= 4
}