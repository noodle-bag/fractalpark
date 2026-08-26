; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_540fc5ba_6b3a_5e55_8718_be55789231bf {
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
    z = sqr(sqr(conj(z))) + juliaOrbitConstant
  bailout:
    |z| <= 4
}