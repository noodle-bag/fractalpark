; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_77ca142c_a2c6_568d_acbd_2b4dde8c7e89 {
  init:
    cclassic = c
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
    cclassic = sqr(juliaOrbitConstant) / z
    cclassic = z + cclassic
    z = sqr(cclassic * juliaOrbitConstant)
  bailout:
    |z| < 4
}