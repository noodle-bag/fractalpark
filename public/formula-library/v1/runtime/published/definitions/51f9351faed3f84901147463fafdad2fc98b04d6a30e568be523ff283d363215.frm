; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6b0c0c41_adc5_54d4_9c59_1a738099b5ec {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * z * (8 * sqr(z) - 4)
  bailout:
    |z| < 100
}
