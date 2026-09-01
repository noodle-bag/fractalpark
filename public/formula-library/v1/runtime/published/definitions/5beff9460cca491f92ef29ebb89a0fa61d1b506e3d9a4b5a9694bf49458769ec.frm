; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2515834d_dd11_5f8a_afb7_0ac9908a3c0a {
  init:
    z = pixel
    f = sinh(pixel)
  loop:
    z = cosxx(z) + f
  bailout:
    |z| <= 50
}
