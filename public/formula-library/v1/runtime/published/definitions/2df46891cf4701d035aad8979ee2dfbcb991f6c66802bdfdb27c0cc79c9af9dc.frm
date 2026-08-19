; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ebe7d5f6_7f65_50cc_b03b_f208d78c955a {
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
    z = cosh(z) / denom + c
  bailout:
    |z| <= 256
}