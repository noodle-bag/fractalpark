; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6a292c82_ac95_5d4c_98d7_963e2f7c5755 {
  parameters:
    start: complex = (0, 0) classic p1
  init:
    drivingPoint = pixel
    z = start
  loop:
    z = (z ^ 2 * (35 * z ^ 2 - 30) + 3) / 8 + drivingPoint
  bailout:
    |z| < 100
}
