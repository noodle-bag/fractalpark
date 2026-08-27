; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_91653f7a_de43_5f1e_ab4d_c98f815b879b {
  init:
    z = pixel
    if ismand
      offsetValue = pixel ^ sin(pixel)
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