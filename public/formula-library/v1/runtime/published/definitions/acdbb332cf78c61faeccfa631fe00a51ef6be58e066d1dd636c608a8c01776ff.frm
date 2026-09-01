; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8216cd19_79d0_56e3_88ac_5c58a28bce85 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * z * (sqr(z) * (sqr(z) * (64 * sqr(z) - 112) + 56) - 7)
  bailout:
    |z| < 100
}
