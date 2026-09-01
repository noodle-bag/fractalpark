; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_2037d212_b1c4_59f4_a773_90b627b1d7df {
  parameters:
    control: complex = (0, 0) classic p1
  init:
    z = (control + 1) / 2 / pixel
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = z * z * z + juliaOrbitConstant * (control + 1) / 2
  bailout:
    |z| <= 4
}