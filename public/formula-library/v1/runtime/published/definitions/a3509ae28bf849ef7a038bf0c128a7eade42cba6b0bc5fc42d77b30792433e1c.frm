; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2b86fa34_dd83_542e_9718_6e8ee2f8b5d2 {
  init:
    z = pixel
    anchor = pixel
  loop:
    z = sqr(conj(z)) + conj(anchor)
  bailout:
    |z| <= 4
}
