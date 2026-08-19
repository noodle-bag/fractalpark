; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_665c8e11_c7d0_5fa2_8b80_ac4027e9ba89 {
  init:
    z = pixel
  loop:
    z = (sqr(z) + 2 * z + pixel) / (sqr(z) - 2 * z + pixel)
  bailout:
    |z| <= 100
}
