; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_e8e735b4_3eb6_53b6_979e_7f70268ceb6b {
  init:
    z = pixel
    additive = sinh(pixel)
  loop:
    z = sqr(z) + additive
  bailout:
    |z| <= 50
}
