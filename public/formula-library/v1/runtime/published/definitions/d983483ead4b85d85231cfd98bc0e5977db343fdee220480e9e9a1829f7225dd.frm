; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_212174eb_5344_57a9_95d4_24882df4b972 {
  parameters:
    offset: complex = (0, 0) classic p1
    thresholdInput: complex = (0, 0) classic p2
    initialTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
    iterationTransform: function = identity classic fn3
  init:
    if real(thresholdInput) <= 0
      threshold = 4
    else
      threshold = real(thresholdInput)
    endif
    previous = pixel
    z = previous
    firstValue = initialTransform(pixel)
    secondValue = secondTransform(pixel)
  loop:
    if |z| <= |previous|
      inward = firstValue
    else
      inward = (0, 0)
    endif
    if |previous| < |z|
      outward = secondValue
    else
      outward = (0, 0)
    endif
    previous = z
    z = iterationTransform(sqr(z)) + inward + outward + offset
  bailout:
    |z| <= threshold
}
