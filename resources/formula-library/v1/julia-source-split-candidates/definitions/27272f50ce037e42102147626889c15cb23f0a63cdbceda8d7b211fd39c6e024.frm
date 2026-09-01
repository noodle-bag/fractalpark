; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_015c5d9d_b9b1_5155_afa7_10a3f48c194a {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    x = flip(juliaOrbitConstant + fn1(3 / z - z / 4))
    z = x * z + p1
  bailout:
    |z| <= 100
}