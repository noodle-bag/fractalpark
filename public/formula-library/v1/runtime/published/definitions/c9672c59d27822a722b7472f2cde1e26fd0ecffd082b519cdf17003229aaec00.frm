; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6fd03e0d_2427_5967_b53d_5540ebc4be56 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = rate * z * (1 - z)
  bailout:
    |z| <= 1
}
