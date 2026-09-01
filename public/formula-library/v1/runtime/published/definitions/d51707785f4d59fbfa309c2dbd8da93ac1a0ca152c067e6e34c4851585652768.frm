; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_1bb379a2_3588_53f8_a3ab_e52021c78054 {
  init:
    seed = pixel
    z = seed
  loop:
    z = sqr(z) + sin(z) + seed
  bailout:
    |z| < 4
}
