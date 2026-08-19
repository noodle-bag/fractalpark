; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8b4578e2_5ecf_5500_9dc9_57a1e51e627e {
  parameters:
    rate: complex = (0, 0) classic p1
    exponent: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = rate * z * (1 - z ^ exponent)
  bailout:
    |z| <= 100
}
