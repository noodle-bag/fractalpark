; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_68753107_933c_565b_8833_052a2886fa86 {
  init:
    z = pixel
    if ismand
      offset = cosxx(pixel)
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosh(z) + offset
  bailout:
    |z| <= 50
}