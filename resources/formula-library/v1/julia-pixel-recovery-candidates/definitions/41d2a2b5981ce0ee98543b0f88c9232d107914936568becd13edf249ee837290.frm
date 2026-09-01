; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_1586a75a_acb4_533b_a3e5_a92eca3acbc9 {
  init:
    z = pixel
    if ismand
      offset = 1 / cosh(pixel)
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}