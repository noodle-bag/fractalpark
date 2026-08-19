; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a3c91590_898f_55f7_92b0_ca549477edd3 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * (sqr(z) * (sqr(z) * (sqr(z) - 5) + 6) - 1)
  bailout:
    |z| < 100
}
