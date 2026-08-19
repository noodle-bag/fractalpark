; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_33afbae3_7ccb_54ca_8f50_771b34de7326 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = pointValue * (z * z * (z * z * (z * z - 6) + 9) - 2)
  bailout:
    |z| < 100
}
