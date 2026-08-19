; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_41a527d4_3c75_5d8d_905d_95381c9f7c6c {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = seed
  loop:
    z = (3 * z * z - 1) / 2 + pointValue
  bailout:
    |z| < 100
}
