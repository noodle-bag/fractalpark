; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0d5e8e2e_45bd_5a45_beab_2f989d765db4 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = (z * (z * (z * (z * (z * (z - 36) + 450) - 2400) + 5400) - 4320) + 720) / 720 + pointValue
  bailout:
    |z| < 100
}
