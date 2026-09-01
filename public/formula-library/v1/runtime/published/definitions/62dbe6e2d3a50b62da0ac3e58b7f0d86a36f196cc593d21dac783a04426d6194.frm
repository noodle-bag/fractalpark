; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8f9eb07a_b405_5d9c_8b6a_9447ad7165b0 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    denom = sinh(z)
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = c * (cosh(z) / denom)
  bailout:
    |z| <= 256
}