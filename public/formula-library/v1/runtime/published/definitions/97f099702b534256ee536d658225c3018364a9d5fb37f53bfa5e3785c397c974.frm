; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8966ff50_0c66_5b18_a73e_6275e6ee5d88 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * (sqr(z) - 2)
  bailout:
    |z| < 100
}
