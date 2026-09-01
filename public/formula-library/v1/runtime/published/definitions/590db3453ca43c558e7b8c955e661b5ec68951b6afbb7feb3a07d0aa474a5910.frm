; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_465a5b03_469d_59b3_8564_45af7564e37a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = abs(z)
    z = p ^ 3 + c
  bailout:
    |z| <= 256
}