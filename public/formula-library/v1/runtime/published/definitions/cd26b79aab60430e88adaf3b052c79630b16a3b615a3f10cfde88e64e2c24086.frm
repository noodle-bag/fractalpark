; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_6e972810_83ea_5557_be77_084f730ee87b {
  parameters:
    exponent: complex = (0, 0) classic p1
  init:
    z = (1 / (exponent + 1)) ^ (1 / exponent)
  loop:
    z = pixel * z * (1 - z ^ exponent)
  bailout:
    |z| <= 100
}
