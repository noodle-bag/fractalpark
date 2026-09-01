; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6ca66e2b_035b_594a_8169_553bf1e51d99 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * z * (sqr(z) * (32 * sqr(z) - 32) + 6)
  bailout:
    |z| < 100
}
