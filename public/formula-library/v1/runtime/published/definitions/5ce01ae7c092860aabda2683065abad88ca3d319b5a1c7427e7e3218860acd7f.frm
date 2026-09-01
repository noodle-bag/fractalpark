; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d848b143_1bb8_524e_b716_f0dd41a836df {
  parameters:
    ringsP: real = 0.5 domain [-2, 2]
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    r2 = real(z) * real(z) + imag(z) * imag(z)
    if r2 < 1e-10
      z = z * z + c
    else
      numerator = (0, 0)
      real(numerator) = ringsP
      z = z * z + c + numerator / z
    endif
  bailout:
    |z| <= 256
}