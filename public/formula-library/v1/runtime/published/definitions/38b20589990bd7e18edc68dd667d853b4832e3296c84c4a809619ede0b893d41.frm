; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2e504dd9_c973_5867_98ff_ed809a862428 {
  parameters:
    start_value: complex = (0, 0) classic p1
  init:
    q = pixel
    z = start_value
  loop:
    z = z * (sqr(z) * (63 * sqr(z) - 70) + 15) / 8 + q
  bailout:
    |z| < 100
}
