; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_1586a75a_acb4_533b_a3e5_a92eca3acbc9 {
  init:
    z = pixel
    offset = 1 / cosh(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
