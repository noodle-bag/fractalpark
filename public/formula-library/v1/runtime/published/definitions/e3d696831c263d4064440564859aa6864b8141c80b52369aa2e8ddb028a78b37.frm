; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4d839da6_3dad_5698_80eb_603fc91db5f4 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = pointValue * z * (z * z * (z * z * (z * z - 6) + 10) - 4)
  bailout:
    |z| < 100
}
