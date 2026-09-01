; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2ab193f5_4919_5e5c_a9fb_c1a0e3f5eb02 {
  parameters:
    power: real = 2
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    a = abs(z)
    if power == 2
      z = z * 0
      real(z) = real(a) * real(a) - imag(a) * imag(a)
      imag(z) = 2 * real(a) * imag(a)
      z = z + c
    else
      z = a ^ power + c
    endif
  bailout:
    |z| <= 256
}