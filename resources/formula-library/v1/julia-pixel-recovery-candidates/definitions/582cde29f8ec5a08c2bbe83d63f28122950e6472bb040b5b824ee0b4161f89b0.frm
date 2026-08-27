; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_74a7ad74_f5bd_5e11_8c33_5887487d5180 {
  init:
    z = (0, 0)
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = flip(sqr(z) + juliaOrbitConstant)
  bailout:
    |z| <= 4
}