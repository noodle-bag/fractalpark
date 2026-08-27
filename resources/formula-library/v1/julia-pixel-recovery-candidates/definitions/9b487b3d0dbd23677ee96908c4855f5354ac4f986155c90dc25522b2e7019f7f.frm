; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_dc949eb5_0f2b_576b_a102_d2015d463a7b {
  init:
    z = pixel
    if ismand
      offsetValue = pixel ^ cosxx(pixel)
    else
      offsetValue = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}