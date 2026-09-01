; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_33236fd9_4bd1_539b_961a_7b95ab92a1e0 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    imag(z) = -abs(imag(z))
    z = z * z + c
  bailout:
    |z| <= 256
}