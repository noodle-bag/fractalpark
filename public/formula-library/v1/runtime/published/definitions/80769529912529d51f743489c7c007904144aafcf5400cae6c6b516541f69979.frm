; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9e88fbd0_1e8e_5257_8294_8a872d9e4aab {
  parameters:
    multiplierOffset: complex = (0, 0) classic p1
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
    thirdTransform: function = identity classic fn3
  init:
    constant = pixel
    z = 0
    multiplier = 2 + multiplierOffset
  loop:
    horizontal = real(z)
    vertical = imag(z)
    firstValue = firstTransform(horizontal * horizontal) - secondTransform(vertical * vertical)
    secondValue = multiplier * thirdTransform(horizontal * vertical)
    z = firstValue + flip(secondValue) + constant
  bailout:
    |z| < 4
}
