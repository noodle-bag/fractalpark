; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_09cecc65_3da9_543a_a1dd_7963f5e2f830 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
  init:
    z = pixel
  loop:
    x = flip(pixel + fn1(p1 / z - z / (p2 + 1)))
    z = x * z + pixel
  bailout:
    |z| <= 100
}