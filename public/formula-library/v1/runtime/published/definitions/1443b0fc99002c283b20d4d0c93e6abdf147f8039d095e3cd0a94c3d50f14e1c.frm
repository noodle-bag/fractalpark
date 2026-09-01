; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_0beb26b1_80e9_5902_9c1c_99eeba6a9465 {
  parameters:
    control: complex = (0, 0) classic p1
  init:
    z = ((control + 1) / 2) / pixel
  loop:
    z = z * z + ((pixel * (control + 1)) / 2) / ((control - 1) / 2)
  bailout:
    |z| <= 4
}
