; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f03e39ad_e077_5e01_8085_f25d653b506e {
  init:
    carrier = pixel
    z = carrier
  loop:
    z = sqr(sqr(z)) + conj(pixel)
  bailout:
    |z| <= 4
}
