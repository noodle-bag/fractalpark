; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c4431abf_9d47_5537_ae91_9bd5cfdaa567 {
  parameters:
    multiplierInput: complex = (0, 0) classic p1
    limitInput: complex = (0, 0) classic p2
    exponentTransform: function = identity classic fn1
    orbitTransform: function = identity classic fn2
  init:
    constant = pixel
    z = constant
    multiplier = (1, 0)
    if real(multiplierInput) != 0 || imag(multiplierInput) != 0
      multiplier = multiplierInput
    endif
    limit = 4
    if real(limitInput) > 0
      limit = real(limitInput)
    endif
  loop:
    powerValue = constant ^ (exponentTransform(z) - multiplier)
    z = orbitTransform((constant * powerValue - multiplier) * powerValue)
  bailout:
    |z| <= limit
}
