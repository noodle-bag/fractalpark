; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ce4febcc_cac4_5319_a46e_389a76e08d6f {
  init:
    z = pixel
    anchor = pixel
  loop:
    z = sqr(conj(z)) + anchor
  bailout:
    |z| <= 4
}
