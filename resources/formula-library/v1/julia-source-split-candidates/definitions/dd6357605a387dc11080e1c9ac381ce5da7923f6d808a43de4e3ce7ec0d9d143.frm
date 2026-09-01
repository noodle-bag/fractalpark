; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fedcfb68_071a_5b21_9552_ac641af3ecce {
  init:
    z = ((1 - pixel) / 3) ^ 0.5
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) * z + (juliaOrbitConstant - 1) * z - juliaOrbitConstant
  bailout:
    |z| <= 4
}