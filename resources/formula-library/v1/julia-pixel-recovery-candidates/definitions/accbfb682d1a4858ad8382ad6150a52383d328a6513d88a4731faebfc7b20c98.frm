; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d0716513_4af5_5183_a963_e9fb6c4f9323 {
  parameters:
    negativeTransform: function = identity classic fn1
    nonnegativeTransform: function = identity classic fn2
  init:
    if ismand
      constant = pixel
    else
      constant = c
    endif
    z = constant
    if !ismand
      z = pixel
    endif
  loop:
    z = negativeTransform(z) * (z < 0) + nonnegativeTransform(z) * (0 <= z) + constant
  bailout:
    |z| < 4
}