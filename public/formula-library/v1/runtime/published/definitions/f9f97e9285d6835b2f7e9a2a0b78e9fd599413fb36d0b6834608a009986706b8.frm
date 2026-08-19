; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_8c95abba_5037_5019_899b_12492010ce3a {
  parameters:
    constantInput: complex = (0, 0) classic p1
    limitInput: complex = (0, 0) classic p2
    outerTransform: function = identity classic fn1
    innerTransform: function = identity classic fn2
  init:
    constant = (0.5, 0)
    if real(constantInput) != 0 || imag(constantInput) != 0
      constant = constantInput
    endif
    limit = 4
    if real(limitInput) > 0
      limit = real(limitInput)
    endif
    z = pixel
  loop:
    z = outerTransform(innerTransform(z * z)) + constant
  bailout:
    |z| <= limit
}
