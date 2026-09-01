; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_d9bc4e37_3fc6_5fa1_b334_e136b94b1e8c {
  init:
    z = pixel
    offsetValue = pixel ^ (1 / pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

