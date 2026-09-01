; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_17d88272_6dbf_5622_996a_b116ea3a3fab {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    if |c| < 1e-20
      logC = (-46.051701859880914, 0)
      imag(logC) = atan2(imag(c), real(c))
    else
      logC = log(c)
    endif
    z = round(exp(z * logC) * 16) / 16
  bailout:
    |z| <= 256
}