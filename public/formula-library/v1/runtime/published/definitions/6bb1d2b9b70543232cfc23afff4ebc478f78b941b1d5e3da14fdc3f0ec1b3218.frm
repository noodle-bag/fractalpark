; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_dc949eb5_0f2b_576b_a102_d2015d463a7b {
  init:
    z = pixel
    offsetValue = pixel ^ cosxx(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

