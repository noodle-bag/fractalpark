; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a3ac54dd_5172_5239_b7fd_8540636ff4eb {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * (2 * sqr(z) - 1)
  bailout:
    |z| < 100
}
