; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4536f1e3_1f15_5b7e_8e58_68ea3b63d4fb {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    real(z) = abs(real(z))
    z = z * z + c
  bailout:
    |z| <= 256
}