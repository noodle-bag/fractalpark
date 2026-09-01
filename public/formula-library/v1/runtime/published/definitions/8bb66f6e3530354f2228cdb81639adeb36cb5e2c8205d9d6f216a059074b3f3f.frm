; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8ddf2423_d8ff_5d3d_967c_5374c52925cb {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * (sqr(z) * (sqr(z) - 3) + 1)
  bailout:
    |z| < 100
}
