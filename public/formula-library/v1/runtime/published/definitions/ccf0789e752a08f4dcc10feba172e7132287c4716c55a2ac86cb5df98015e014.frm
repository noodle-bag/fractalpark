; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8f661407_f2c9_57e5_8c01_9b63a3cd0493 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = abs(z)
    z2 = p * p
    z = z * 0
    real(z) = abs(real(z2))
    imag(z) = imag(z2)
    z = z + c
  bailout:
    |z| <= 256
}