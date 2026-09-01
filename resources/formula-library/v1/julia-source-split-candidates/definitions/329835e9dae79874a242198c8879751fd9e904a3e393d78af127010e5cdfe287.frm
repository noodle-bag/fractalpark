; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_c698d9dd_78c0_5478_8aa2_0230a9728ca8 {
  parameters:
    f1: function = identity classic fn1
    f2: function = identity classic fn2
  init:
    z = pixel
    s = pixel - f1(z)
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    s = juliaOrbitConstant + s / z
    z = s - f2(z * juliaOrbitConstant)
  bailout:
    |z| < 4
}