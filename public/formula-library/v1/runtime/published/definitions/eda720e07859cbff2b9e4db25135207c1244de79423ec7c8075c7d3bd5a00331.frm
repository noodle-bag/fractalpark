; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_77fb9270_e9aa_5e7d_af63_d3c28af6d9ad {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * (sqr(z) * (sqr(z) * (sqr(z) - 6) + 9) - 2)
  bailout:
    |z| < 100
}
