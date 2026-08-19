; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_48a9aa85_f5d4_5f9a_b640_89e93890a8ad {
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
    z4 = z ^ 4
    denom = z4
    if real(denom) * real(denom) + imag(denom) * imag(denom) < 1e-10
      denom = denom + (0.00001, 0)
    endif
    z = z ^ 3 + c / denom
  bailout:
    |z| <= 256
}