; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e7a86d4b_06bf_575d_9eaf_c0ab7f21841e {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = carrier * (sqr(z) - 1)
  bailout:
    |z| < 100
}
