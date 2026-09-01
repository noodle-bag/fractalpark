; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_fe092eb1_5e44_5b5b_b028_f1298671a038 {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = z * z * z + (p1 - 1) * z - p1
  bailout:
    |z| <= 4
}