; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_05f97a66_bed1_5a90_9477_2c1c0679015a {
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
    f2 = fn2(z)
    z = fn1(f2) * fn3(fn4(f2)) + juliaOrbitConstant
  bailout:
    |z| <= t
}