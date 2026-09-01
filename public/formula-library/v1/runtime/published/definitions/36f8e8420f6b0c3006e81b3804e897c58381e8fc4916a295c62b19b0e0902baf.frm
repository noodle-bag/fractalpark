; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a0780d2d_a2e9_5139_92fe_b9d0f7edada2 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = (z * z - 1) / (z * z + 2) * fn1(z) * fn2(z) + p1
  bailout:
    |z| <= 100
}