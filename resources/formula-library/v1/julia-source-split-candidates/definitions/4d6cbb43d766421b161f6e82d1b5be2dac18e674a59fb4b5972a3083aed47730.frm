; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_dbf387b3_2c00_5e84_a781_01742fcf893b {
  parameters:
    parameter1: complex = (0, 0) classic p1
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
    z = p1 * z * z * z + z * z + juliaOrbitConstant
  bailout:
    |z| <= 100
}