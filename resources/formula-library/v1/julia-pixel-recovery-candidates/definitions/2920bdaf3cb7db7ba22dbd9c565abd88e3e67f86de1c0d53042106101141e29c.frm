; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bb048a8c_0c83_59b9_97e7_c5ed2fc39524 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
  init:
    z = pixel
    t = p1 + 4
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = fn1(z ^ juliaOrbitConstant)
  bailout:
    |z| <= t
}