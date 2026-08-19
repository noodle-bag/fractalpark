; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_573d8cb0_13e5_51e6_880d_a7c4fb4f5321 {
  init:
    seed = pixel
    z = (0, 0)
  loop:
    z = sqr(z) + seed + sin(z)
  bailout:
    |z| < 4
}
