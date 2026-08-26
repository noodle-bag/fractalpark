; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fd6c2fac_31db_55f1_9d93_726bd261671d {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    z = p1
    x = |z|
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    if 0.9999999999 < x
      z = cosh(z) + juliaOrbitConstant
    endif
    z = sqr(z) + juliaOrbitConstant
    x = |z|
  bailout:
    x <= 4
}