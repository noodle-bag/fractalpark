; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_74874658_3c47_5813_869a_70e642dc0038 {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    q = constant
    z = pixel
  loop:
    z = sqr(z) * z + (q - 1) * z + pixel
  bailout:
    |z| <= 4
}
