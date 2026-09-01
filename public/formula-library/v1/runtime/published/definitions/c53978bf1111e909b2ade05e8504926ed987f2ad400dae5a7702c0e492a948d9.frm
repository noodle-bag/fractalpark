; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_ec9ca8e4_66ef_5b97_a706_9164d2b03622 {
  init:
    z = pixel
    offsetValue = 1 / pixel
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

