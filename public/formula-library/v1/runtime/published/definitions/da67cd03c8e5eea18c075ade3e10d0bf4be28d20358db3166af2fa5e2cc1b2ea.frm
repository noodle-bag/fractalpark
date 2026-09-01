; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ad38dcc4_1079_5638_a35c_b16f53ce6e62 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * z * (sqr(z) - 3)
  bailout:
    |z| < 100
}
