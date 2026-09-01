; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3705eb33_b86f_5ef4_9ad5_022ab076390f {
  parameters:
    offset: complex = (0, 0) classic p1
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
    thirdTransform: function = identity classic fn3
    fourthTransform: function = identity classic fn4
  init:
    z = pixel
  loop:
    horizontal = real(z)
    vertical = imag(z)
    firstValue = firstTransform(horizontal) * secondTransform(vertical)
    secondValue = thirdTransform(horizontal) * fourthTransform(vertical)
    combined = (-2) * firstValue * secondValue + offset
    vertical = real(secondValue * secondValue - firstValue * firstValue)
    z = combined + flip(vertical)
  bailout:
    |z| <= 100
}
