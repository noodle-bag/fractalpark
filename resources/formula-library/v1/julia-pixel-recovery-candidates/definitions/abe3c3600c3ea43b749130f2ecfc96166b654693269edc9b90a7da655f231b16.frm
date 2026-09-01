; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_99e9f931_2711_51ae_ae06_28e9345277ba {
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
    z = fn1(fn2(fn3(z) + juliaOrbitConstant * juliaOrbitConstant))
  bailout:
    |z| <= t
}