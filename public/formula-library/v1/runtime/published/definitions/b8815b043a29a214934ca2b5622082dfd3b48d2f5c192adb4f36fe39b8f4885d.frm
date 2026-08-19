; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_f4216f6d_c8ed_5837_8417_8ae719f186a8 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sin(sqr(z)) + sin(z) + sin(offset)
  bailout:
    |z| <= 4
}

