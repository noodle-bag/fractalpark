; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6e987df6_9931_5242_9f83_80ebb0c922be {
  parameters:
    source: function = identity classic fn1
    transform: function = identity classic fn2
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
    temporary = fn1(juliaOrbitConstant) / z
    temporary = z + temporary
    z = fn2(temporary * juliaOrbitConstant)
  bailout:
    |z| < 4
}