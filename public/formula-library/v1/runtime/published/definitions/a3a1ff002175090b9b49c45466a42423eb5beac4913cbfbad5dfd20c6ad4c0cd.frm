; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_948e00da_175d_5863_8c9c_6038df9a402a {
  init:
    z = pixel
  loop:
    z = (z ^ 2 + 3 * z + pixel) / (z ^ 2 - 3 * z - pixel)
  bailout:
    |z| <= 10
}
