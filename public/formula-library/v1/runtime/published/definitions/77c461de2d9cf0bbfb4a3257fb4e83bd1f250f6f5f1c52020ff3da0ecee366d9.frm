; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_028a6158_e5dd_5d63_a5a7_5db2e3f7d87d {
  init:
    z = pixel
    offset = cosxx(pixel) / sin(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
