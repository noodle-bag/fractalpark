; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_c18f4721_75e2_5ea4_81a0_95b8c49dfc86 {
  init:
    z = pixel
    offsetValue = pixel ^ (1 / sin(pixel))
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

