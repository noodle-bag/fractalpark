; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_89e6c1c2_5105_50b7_b7e2_e1f03e4fe8e1 {
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