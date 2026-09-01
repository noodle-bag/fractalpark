; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d3e27379_6323_5764_8a1e_17d88e5ea696 {
  init:
    z = pixel
    additive = log(pixel)
  loop:
    z = sqr(z) + additive
  bailout:
    |z| <= 50
}
