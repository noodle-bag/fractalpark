; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_27a3da95_a9e6_5fc2_81af_d5e9076fc8fa {
  parameters:
    power: real = 2
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    a = conj(z)
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