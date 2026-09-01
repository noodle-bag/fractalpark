; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d01f1a01_6e77_5a24_8593_a7009e1c3ea3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = imag(z)
    imag(p) = abs(real(z))
    z = p * p + c
  bailout:
    |z| <= 256
}