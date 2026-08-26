; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_554eef03_e757_5146_87f5_f03e5f75225e {
  init:
    q = pixel
    z = q
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) + conj(juliaOrbitConstant)
  bailout:
    |z| <= 4
}