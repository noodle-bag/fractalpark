; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a3f8a298_ed79_5826_8652_74589c595e06 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * z * (sqr(z) * (sqr(z) * (sqr(z) - 7) + 14) - 7)
  bailout:
    |z| < 100
}
