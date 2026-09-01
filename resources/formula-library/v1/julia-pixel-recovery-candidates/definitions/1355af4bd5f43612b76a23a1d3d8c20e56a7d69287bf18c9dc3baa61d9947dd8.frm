; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c871e135_86d3_59c2_a879_69eaca0a8c22 {
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
    z = flip((z ^ 2 + juliaOrbitConstant) / (juliaOrbitConstant ^ 2 + z))
  bailout:
    |z| <= 4
}