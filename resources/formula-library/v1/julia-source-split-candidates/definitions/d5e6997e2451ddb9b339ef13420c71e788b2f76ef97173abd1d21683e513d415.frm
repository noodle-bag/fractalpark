; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9923991c_19b5_5559_8250_5eb04726f4bd {
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