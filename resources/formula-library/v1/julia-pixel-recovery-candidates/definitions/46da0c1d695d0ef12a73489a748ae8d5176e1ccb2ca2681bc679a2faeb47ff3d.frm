; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_11915b30_2b96_51dc_8d0d_b998c34c5fc0 {
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
    z = sqr(conj(z)) * conj(z) + juliaOrbitConstant
  bailout:
    |z| <= 4
}