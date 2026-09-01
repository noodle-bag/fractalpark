; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_93102e86_d35b_53f2_8569_47a4a20a656d {
  init:
    z = pixel
    if ismand
      offsetValue = pixel ^ (1 / sinh(pixel))
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