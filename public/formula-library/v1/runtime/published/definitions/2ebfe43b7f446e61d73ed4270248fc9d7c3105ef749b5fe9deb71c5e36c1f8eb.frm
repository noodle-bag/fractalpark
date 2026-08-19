; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d524bd96_37d0_5a16_b38e_7a8e6bd30c09 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    z = carrier * z * (sqr(z) - 2)
  bailout:
    |z| < 100
}
