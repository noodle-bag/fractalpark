; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5e77d815_2c11_519d_a7fb_edcddb504d54 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
    function2: function = identity classic fn2
    function3: function = identity classic fn3
    function4: function = identity classic fn4
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
    z = fn1(fn2(z) * juliaOrbitConstant * fn3(fn4(z) * juliaOrbitConstant)) * juliaOrbitConstant
  bailout:
    |z| <= t
}