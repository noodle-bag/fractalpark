; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6a9f2e31_71d3_5074_b552_9aa2e704ff94 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * (sqr(z) * (8 * sqr(z) + 8) + 1)
  bailout:
    |z| < 100
}
