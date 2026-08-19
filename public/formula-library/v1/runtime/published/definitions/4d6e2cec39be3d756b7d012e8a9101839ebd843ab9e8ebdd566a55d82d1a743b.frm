; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d55f924e_86a7_540d_afb4_e678f640a66b {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = carrier * (4 * sqr(z) - 1)
  bailout:
    |z| < 100
}
