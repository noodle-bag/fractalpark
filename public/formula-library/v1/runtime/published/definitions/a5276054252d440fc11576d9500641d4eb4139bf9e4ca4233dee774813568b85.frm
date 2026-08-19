; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_42d4c442_040b_59be_892f_1f10c8e47cb6 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(imag(z))
    imag(p) = abs(real(z))
    z = p * p + c
  bailout:
    |z| <= 256
}