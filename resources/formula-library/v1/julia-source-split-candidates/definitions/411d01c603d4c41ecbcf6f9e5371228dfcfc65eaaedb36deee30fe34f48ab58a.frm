; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5f191f8d_ec65_52c1_8e86_c747a919f3cf {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
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
    z2 = fn1(z)
    z = fn2(z2 * fn3(z2) + z2) + juliaOrbitConstant
  bailout:
    |z| <= t
}