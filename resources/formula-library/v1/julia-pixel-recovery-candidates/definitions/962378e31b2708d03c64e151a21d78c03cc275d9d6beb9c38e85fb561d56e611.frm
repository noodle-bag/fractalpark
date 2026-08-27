; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_d9bc4e37_3fc6_5fa1_b334_e136b94b1e8c {
  init:
    z = pixel
    if ismand
      offsetValue = pixel ^ (1 / pixel)
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