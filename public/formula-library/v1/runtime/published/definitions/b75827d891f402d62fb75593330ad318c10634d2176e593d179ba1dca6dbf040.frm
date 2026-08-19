; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_7ce8c07c_0ba6_560c_9316_9aa2439997b3 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    x = 1 - z ^ p1
    z = z * ((1 - x) / (1 + x)) ^ (1 / p1) + p2
  bailout:
    |z| <= 4
}