; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_da1b12b4_9d7d_5d69_b744_385ae5e4b577 {
  parameters:
    adjustment: complex = (0, 0) classic p1
  init:
    z = (adjustment + 1) / 2 / pixel
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) + juliaOrbitConstant * (adjustment + 1) / 2
  bailout:
    |z| <= 4
}