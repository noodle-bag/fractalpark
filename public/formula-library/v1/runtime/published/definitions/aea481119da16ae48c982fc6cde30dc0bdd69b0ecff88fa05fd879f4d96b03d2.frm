; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_42b54420_5e0a_5f09_9dcd_0c262fd41d04 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = (z * (z - 4) + 2) / 2 + pointValue
  bailout:
    |z| < 100
}
