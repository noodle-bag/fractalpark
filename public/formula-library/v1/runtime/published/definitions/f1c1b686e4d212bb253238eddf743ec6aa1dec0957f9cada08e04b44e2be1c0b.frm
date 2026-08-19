; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_267869db_2e96_5d61_80ed_fab704e61585 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    parameter2: complex = (0, 0) classic p2
    function1: function = identity classic fn1
  init:
    cclassic = c
    z = real(pixel)
    cclassic = p2 + imag(pixel)
  loop:
    z = (fn1(z) + cclassic) ^ p1
  bailout:
    |z| <= 4
}