; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fb27a5ed_2865_5fca_ad62_76118c39414f {
  parameters:
    adjustment: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(z) + (adjustment + 1) / 2
  bailout:
    |z| <= 4
}
