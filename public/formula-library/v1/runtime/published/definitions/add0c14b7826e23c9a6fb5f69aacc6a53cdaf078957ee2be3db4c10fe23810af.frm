; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_79a1e37c_169d_5603_84ae_ebf291c3ff97 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * z * (4 * sqr(z) - 3)
  bailout:
    |z| < 100
}
