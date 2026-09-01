; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_06223e69_6d8c_50ba_8e5d_b630d342d910 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    folded = (0, 0)
    real(folded) = abs(real(z2))
    imag(folded) = imag(z2)
    z = conj(folded) + c
  bailout:
    |z| <= 256
}