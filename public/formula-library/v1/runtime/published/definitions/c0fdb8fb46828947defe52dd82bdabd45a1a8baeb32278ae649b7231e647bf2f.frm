; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_da95ae4b_d401_5eb0_862c_7d977c328fad {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
  init:
    z = pixel
    t = p1 + 4
  loop:
    sqrz = fn1(z)
    z = sqrz + 1 / sqrz + pixel
  bailout:
    |z| <= t
}