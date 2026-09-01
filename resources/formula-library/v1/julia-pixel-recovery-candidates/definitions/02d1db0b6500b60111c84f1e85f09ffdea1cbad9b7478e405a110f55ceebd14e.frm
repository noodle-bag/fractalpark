; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3aa12569_e267_56b6_b582_bf95b73fd1a4 {
  parameters:
    threshold: complex = (0, 0) classic p1
  init:
    if ismand
      seed = pixel
    else
      seed = c
    endif
    z = pixel
    if !ismand
      z = pixel
    endif
  loop:
    z = seed ^ z
  bailout:
    |z| <= real(threshold)
}