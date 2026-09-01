; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3e73820f_a131_5b85_ae43_4bbc5ff697d2 {
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
    z = sqr(conj(z)) * conj(z) + conj(juliaOrbitConstant)
  bailout:
    |z| <= 4
}