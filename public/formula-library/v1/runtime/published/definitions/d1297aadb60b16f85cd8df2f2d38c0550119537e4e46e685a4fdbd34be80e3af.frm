; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_220b121f_2a09_5c0a_a90e_b81044f0206b {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    pointValue = pixel
    z = scale
  loop:
    z = pointValue * (z * z * (16 * z * z - 12) + 1)
  bailout:
    |z| < 100
}
