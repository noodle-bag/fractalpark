; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3a83800c_4a44_5e61_9651_d3d5adb71213 {
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
    z = conj(p * p) + c
  bailout:
    |z| <= 256
}