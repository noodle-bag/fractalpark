; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5c699919_a5f7_5995_8673_53b7088d5b39 {
  parameters:
    feedback: complex = (0, 0) classic p1
  init:
    horizontal = real(pixel)
    vertical = imag(pixel)
    previousHorizontal = 0
    previousVertical = 0
  loop:
    horizontalSquare = horizontal * horizontal
    verticalSquare = vertical * vertical
    nextHorizontal = horizontalSquare - verticalSquare + real(feedback) + imag(feedback) * previousHorizontal
    nextVertical = 2 * horizontal * vertical + imag(feedback) * previousVertical
    previousHorizontal = horizontal
    previousVertical = vertical
    horizontal = nextHorizontal
    vertical = nextVertical
    z = previousHorizontal + previousVertical
  bailout:
    |z| <= 4
}
