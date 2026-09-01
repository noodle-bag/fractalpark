; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1b93e201_bdba_5bb4_8605_562d2548e100 {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = scale
  loop:
    z = pointValue * (z * z * (z * z * (64 * z * z - 80) + 24) - 1)
  bailout:
    |z| < 100
}
