; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5c699919_a5f7_5995_8673_53b7088d5b39 {
  parameters:
    feedback: complex = (0, 0) classic p1
  init:
    z = pixel
    currentReal = real(pixel)
    currentImaginary = imag(pixel)
    priorReal = 0
    priorImaginary = 0
  loop:
    realSquare = currentReal * currentReal
    imaginarySquare = currentImaginary * currentImaginary
    nextReal = realSquare - imaginarySquare + real(feedback) + imag(feedback) * priorReal
    nextImaginary = 2 * currentReal * currentImaginary + imag(feedback) * priorImaginary
    priorReal = currentReal
    priorImaginary = currentImaginary
    currentReal = nextReal
    currentImaginary = nextImaginary
    z = priorReal + priorImaginary
  bailout:
    LastSqr <= 16
}
