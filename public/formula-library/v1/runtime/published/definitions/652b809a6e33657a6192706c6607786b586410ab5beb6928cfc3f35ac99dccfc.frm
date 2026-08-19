; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_2826b57e_ae1a_564b_a17d_6ae3beedd30b {
  init:
    z = pixel
    offset = 1 / sin(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
