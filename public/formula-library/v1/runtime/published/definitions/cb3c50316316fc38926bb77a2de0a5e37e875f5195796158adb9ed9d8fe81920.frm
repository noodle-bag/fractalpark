; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2525eb15_1ca6_560c_9aa3_09bc8c9aef58 {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = scale
  loop:
    z = pointValue * (4 * z * z - 1)
  bailout:
    |z| < 100
}
