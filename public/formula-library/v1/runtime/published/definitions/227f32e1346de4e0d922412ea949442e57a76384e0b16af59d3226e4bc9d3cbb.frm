; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cce36994_9654_5214_b931_b865d4f4bb90 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (3 * sqr(z) - 1) / 2 + offset
  bailout:
    |z| < 100
}
