; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_066c7fbe_88ed_5421_b2f9_e5870f649a39 {
  parameters:
    iterationLimit: complex = (0, 0) classic p1
    sourceTransform: function = identity classic fn1
    orbitTransform: function = identity classic fn2
  init:
    exponent = exp(1)
    z = pixel
    offset = sourceTransform(pixel)
    limit = 100
    if real(iterationLimit) > 0
      limit = real(iterationLimit)
    endif
  loop:
    z = orbitTransform(z) ^ exponent + offset
  bailout:
    |z| <= limit
}
