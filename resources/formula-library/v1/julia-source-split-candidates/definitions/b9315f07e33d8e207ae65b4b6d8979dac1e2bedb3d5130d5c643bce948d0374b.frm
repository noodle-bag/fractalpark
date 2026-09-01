; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cc489215_c7d7_5f2c_b11a_1be049b167bd {
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
    z = log(z) * juliaOrbitConstant
  bailout:
    |z| <= 50
}