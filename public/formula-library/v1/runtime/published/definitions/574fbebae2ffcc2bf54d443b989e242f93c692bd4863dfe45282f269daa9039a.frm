; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_c76de166_3e77_5fcd_89e3_92561b33f0b8 {
  init:
    z = pixel
  loop:
    z = tan(z) + (-0.74543, 0.2)
  bailout:
    |z| <= 4
}

