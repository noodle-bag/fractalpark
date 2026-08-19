; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_5f0a5361_4138_5a1a_9097_0765a5b77e40 {
  init:
    z = pixel
    offset = sinh(pixel)
  loop:
    z = sin(z) + offset
  bailout:
    |z| <= 50
}
