; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d8ed1025_8ccf_5424_b161_df178a36a0fa {
  init:
    z = pixel
    z = sqr(z)
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = z + juliaOrbitConstant
    z = sqr(z)
  bailout:
    LastSqr <= 4
}