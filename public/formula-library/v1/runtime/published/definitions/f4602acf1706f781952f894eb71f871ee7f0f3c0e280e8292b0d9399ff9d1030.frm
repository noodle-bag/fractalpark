; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0b667736_2930_56c9_ba2b_f5c1f4f76d58 {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = p1 * z * (1 - flip(z) * flip(z))
  bailout:
    |z| <= 100
}