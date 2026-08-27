; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_31680a23_4d7e_5844_a598_9682609d0ade {
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
    z = 1 / flip(sqr(z) + juliaOrbitConstant)
  bailout:
    |z| <= 4
}