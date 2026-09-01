; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_aa007826_291a_5969_8563_5b4c97cec10b {
  init:
    z = pixel
    offsetValue = sin(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

