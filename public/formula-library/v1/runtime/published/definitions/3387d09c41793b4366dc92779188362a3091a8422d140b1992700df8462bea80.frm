; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a7beb1e7_dc8b_5411_acdf_6781eafd8b29 {
  init:
    q = pixel
    z = q
  loop:
    z = sqr(sqr(conj(z))) + conj(pixel)
  bailout:
    |z| <= 4
}
