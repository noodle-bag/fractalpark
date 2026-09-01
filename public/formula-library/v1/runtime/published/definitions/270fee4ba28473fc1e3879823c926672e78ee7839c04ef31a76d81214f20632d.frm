; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_27ff838d_9331_5fd6_89d7_6afa24341f44 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = z * (5 * z * z - 3) / 2 + pointValue
  bailout:
    |z| < 100
}
