; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6c1385a9_2d23_5816_90d1_2752905fc353 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z2 = z * z
    denom = real(z2) * real(z2) + imag(z2) * imag(z2)
    if denom < 1e-10
      denom = 1e-10
    endif
    invZ2 = (0, 0)
    real(invZ2) = real(z2) / denom
    imag(invZ2) = -imag(z2) / denom
    z = invZ2 + c
  bailout:
    |z| <= 256
}