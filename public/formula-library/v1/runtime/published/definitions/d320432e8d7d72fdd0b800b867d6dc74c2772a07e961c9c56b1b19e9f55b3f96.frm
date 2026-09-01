; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_09d9b20b_7e97_5d87_a883_e1c4435effa3 {
  init:
    z = pixel
    offset = pixel ^ (sin(pixel) / cosxx(pixel))
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
