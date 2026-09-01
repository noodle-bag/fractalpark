; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a2f48cb8_1aa3_5b80_bf04_e10ddc033ed0 {
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
    z = sqr(z) * z + (juliaOrbitConstant - 1) * z - juliaOrbitConstant
  bailout:
    |z| <= 4
}