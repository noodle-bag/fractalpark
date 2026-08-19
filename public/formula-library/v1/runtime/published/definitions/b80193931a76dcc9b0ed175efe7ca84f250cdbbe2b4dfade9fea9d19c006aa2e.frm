; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4648b165_1bb6_5b33_a7ff_3f3518e2a984 {
  parameters:
    firstOffset: complex = (0, 0) classic p1
    secondOffset: complex = (0, 0) classic p2
    transform: function = identity classic fn1
  init:
    z = transform(pixel)
  loop:
    a = abs(imag(z) - real(z))
    b = abs(1 - real(z) - imag(z))
    z = firstOffset + flip(secondOffset)
    real(z) = real(z) - a
    imag(z) = imag(z) - b
  bailout:
    |z| < 1
}
