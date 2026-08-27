; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0be09ed0_d506_51d9_aadf_2d06d7316aeb {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    z = pixel
    tst = p1 + 4
    if ismand
      t = 1 + pixel
    else
      t = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) + t
  bailout:
    |z| <= tst
}