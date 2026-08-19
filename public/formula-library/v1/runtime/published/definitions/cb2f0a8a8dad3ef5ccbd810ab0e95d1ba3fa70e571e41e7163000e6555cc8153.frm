; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_bdd74323_97f3_5fe8_a9b7_951f7a72dc9e {
  init:
    z = pixel
  loop:
    z = z * z + (0.11031, -0.67037)
  bailout:
    |z| <= 4
}