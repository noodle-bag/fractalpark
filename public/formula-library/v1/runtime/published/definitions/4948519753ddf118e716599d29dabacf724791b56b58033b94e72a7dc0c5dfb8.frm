; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3aaa6cca_c480_5359_a2f3_547f3a955eb1 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = pointValue * z * (z * z * (z * z * (64 * z * z - 112) + 56) - 7)
  bailout:
    |z| < 100
}
