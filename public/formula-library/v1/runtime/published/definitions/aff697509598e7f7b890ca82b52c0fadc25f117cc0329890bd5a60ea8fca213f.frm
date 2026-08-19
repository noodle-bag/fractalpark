; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7ead9a6a_0c66_5aa8_a448_d8594876e727 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * z * (sqr(z) * (32 * sqr(z) - 32) + 6)
  bailout:
    |z| < 100
}
