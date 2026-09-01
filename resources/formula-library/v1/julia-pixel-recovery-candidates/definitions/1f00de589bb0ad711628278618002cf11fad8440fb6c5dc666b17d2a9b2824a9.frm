; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fc36a6e1_9778_511c_8f5d_0bdddc463b62 {
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
    sqrz = z * z
    z = sqrz + 1 / sqrz + juliaOrbitConstant
  bailout:
    |z| <= 4
}