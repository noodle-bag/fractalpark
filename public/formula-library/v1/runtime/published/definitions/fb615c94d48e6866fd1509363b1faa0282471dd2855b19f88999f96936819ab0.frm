; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_df5e06a1_1983_5ce5_90df_9b545d112551 {
  init:
    z = pixel
    offsetValue = pixel ^ cosh(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

