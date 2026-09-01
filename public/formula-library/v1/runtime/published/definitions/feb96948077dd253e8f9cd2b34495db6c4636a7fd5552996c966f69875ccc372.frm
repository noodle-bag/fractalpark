; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_9b116c1f_4bb9_5788_83db_7aecb0b03404 {
  init:
    z = pixel
    offsetValue = pixel ^ tanh(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

