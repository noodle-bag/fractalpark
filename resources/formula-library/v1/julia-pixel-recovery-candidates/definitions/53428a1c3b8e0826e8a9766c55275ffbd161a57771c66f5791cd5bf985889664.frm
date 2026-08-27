; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_71ab3539_56d9_5792_9c33_2cc7a67b73ac {
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
    z = (sqr(z) + juliaOrbitConstant) / (sqr(juliaOrbitConstant) + z)
  bailout:
    |z| <= 4
}