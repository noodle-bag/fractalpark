; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_ce1388b4_8994_5948_beaf_e9b54a80a350 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = cosh(z) + offset
  bailout:
    abs(z) < 40
}

