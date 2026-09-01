; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_68753107_933c_565b_8833_052a2886fa86 {
  init:
    z = pixel
    offset = cosxx(pixel)
  loop:
    z = cosh(z) + offset
  bailout:
    |z| <= 50
}
