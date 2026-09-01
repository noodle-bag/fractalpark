; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c64fd5e1_77f7_5b37_bafa_e5da99a5e22d {
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
    z = sqr(cclassic)
  bailout:
    |z| < 4
}