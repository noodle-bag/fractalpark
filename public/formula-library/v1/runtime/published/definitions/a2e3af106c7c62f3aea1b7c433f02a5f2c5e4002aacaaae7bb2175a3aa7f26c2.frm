; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_14cf0fba_341d_5332_b3f0_2648304429e1 {
  init:
    z = pixel
  loop:
    z = sin(sqr(z) + pixel)
  bailout:
    |z| <= 4
}
