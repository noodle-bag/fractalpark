; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0e58167e_79e1_56f9_86f7_149737fcfaea {
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
    z = z ^ juliaOrbitConstant + juliaOrbitConstant ^ z
  bailout:
    |z| <= 96
}