; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_dff2d794_c48f_5555_af0d_e7fe77a80099 {
  parameters:
    transform: function = identity classic fn1
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
    z = 1 / transform(z * z + juliaOrbitConstant * juliaOrbitConstant)
  bailout:
    |z| <= 50
}