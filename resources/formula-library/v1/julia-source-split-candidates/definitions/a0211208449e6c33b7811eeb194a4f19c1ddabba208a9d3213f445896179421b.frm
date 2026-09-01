; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_e39472e4_6152_5f8e_be96_a9566c891dc8 {
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
    z = z * juliaOrbitConstant - juliaOrbitConstant / sqr(z)
  bailout:
    |z| <= 4
}