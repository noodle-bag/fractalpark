; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_0b6fa82f_3b3a_584f_acaf_d51fe7f0f6aa {
  init:
    z = pixel
    if ismand
      offset = 1 / cosxx(pixel)
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