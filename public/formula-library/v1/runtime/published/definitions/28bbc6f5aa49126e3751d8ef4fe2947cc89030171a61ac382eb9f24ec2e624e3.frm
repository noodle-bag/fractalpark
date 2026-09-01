; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_defaf6f8_db0a_52c8_9ca0_0d5d3bdac49f {
  init:
    z = pixel
    offsetValue = sinh(pixel)
  loop:
    z = sinh(z) + offsetValue
  bailout:
    |z| <= 50
}

