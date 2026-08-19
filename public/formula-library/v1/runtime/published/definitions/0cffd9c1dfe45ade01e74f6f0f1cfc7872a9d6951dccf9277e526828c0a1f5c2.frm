; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_79260cb1_fa26_5139_a3dc_8ecdc29a2afd {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    q = offset
    z = pixel
  loop:
    z = (sqr(z) * (35 * sqr(z) - 30) + 3) / 8 + q
  bailout:
    |z| < 100
}
