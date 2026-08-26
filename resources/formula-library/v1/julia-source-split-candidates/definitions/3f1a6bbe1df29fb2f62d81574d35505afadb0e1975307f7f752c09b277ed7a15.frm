; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_573d8cb0_13e5_51e6_880d_a7c4fb4f5321 {
  init:
    if ismand
      seed = pixel
    else
      seed = c
    endif
    z = (0, 0)
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) + seed + sin(z)
  bailout:
    |z| < 4
}