; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4f32e099_69b0_5b43_8d37_c547cee8f4f5 {
  parameters:
    negative: function = identity classic fn1
    nonnegative: function = identity classic fn2
  init:
    z = pixel
    if ismand
      anchor = pixel
    else
      anchor = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    termA = fn1(z) * (real(z) < 0)
    termB = fn2(z) * (0 <= real(z))
    z = termA + termB + anchor
  bailout:
    |z| < 4
}