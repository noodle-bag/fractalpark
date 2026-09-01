; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_11915b30_2b96_51dc_8d0d_b998c34c5fc0 {
  init:
    z = pixel
  loop:
    z = sqr(conj(z)) * conj(z) + pixel
  bailout:
    |z| <= 4
}
