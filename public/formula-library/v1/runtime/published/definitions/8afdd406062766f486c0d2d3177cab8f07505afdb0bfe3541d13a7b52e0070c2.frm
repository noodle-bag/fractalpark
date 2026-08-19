; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6d413a47_cca9_5cb0_8c0e_60e3887a6138 {
  init:
    q = pixel
    z = q
  loop:
    z = sqr(z) * z + conj(pixel)
  bailout:
    |z| <= 4
}
