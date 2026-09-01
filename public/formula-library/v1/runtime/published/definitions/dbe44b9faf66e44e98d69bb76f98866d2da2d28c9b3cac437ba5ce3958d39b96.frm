; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_300db23f_8a8a_59d7_b4f1_bc77757286c6 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    x = (1 - z ^ p1) ^ (1 / p1)
    z = z * (1 - x) / (1 + x) + p2
  bailout:
    |z| <= 4
}