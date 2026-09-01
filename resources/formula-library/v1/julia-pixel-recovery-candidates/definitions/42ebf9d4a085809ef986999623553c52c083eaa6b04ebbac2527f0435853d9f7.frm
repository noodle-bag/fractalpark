; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_665c8e11_c7d0_5fa2_8b80_ac4027e9ba89 {
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
    z = (sqr(z) + 2 * z + juliaOrbitConstant) / (sqr(z) - 2 * z + juliaOrbitConstant)
  bailout:
    |z| <= 100
}