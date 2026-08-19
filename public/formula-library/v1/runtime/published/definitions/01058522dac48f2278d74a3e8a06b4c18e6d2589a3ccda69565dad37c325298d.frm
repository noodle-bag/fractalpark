; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_627c38a8_8f4d_548f_a5a6_dd9f215adf60 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(real(z))
    imag(p) = imag(z)
    z2 = p * p
    z = z * 0
    real(z) = abs(real(z2))
    imag(z) = imag(z2)
    z = z + c
  bailout:
    |z| <= 256
}