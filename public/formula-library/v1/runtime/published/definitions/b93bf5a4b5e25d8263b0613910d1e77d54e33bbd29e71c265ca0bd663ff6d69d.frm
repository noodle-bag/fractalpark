; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3e73820f_a131_5b85_ae43_4bbc5ff697d2 {
  init:
    z = pixel
  loop:
    z = sqr(conj(z)) * conj(z) + conj(pixel)
  bailout:
    |z| <= 4
}
