; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_725485b6_49a7_5063_a603_d0f92783d276 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * (sqr(z) * (sqr(z) * (32 * sqr(z) - 48) + 18) - 1)
  bailout:
    |z| < 100
}
