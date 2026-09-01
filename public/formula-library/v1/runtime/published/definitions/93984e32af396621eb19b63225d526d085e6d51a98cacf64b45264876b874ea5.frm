; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_be109980_7f5d_537e_8197_c3392a3ac0cb {
  init:
    z = (0, 0)
  loop:
    z = sqr(z) + sin(pixel)
  bailout:
    |z| < 4
}

