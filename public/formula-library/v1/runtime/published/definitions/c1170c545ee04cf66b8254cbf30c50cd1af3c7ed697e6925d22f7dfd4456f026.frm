; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_26834584_a1da_54a6_a98d_3a680ea6b259 {
  parameters:
    base: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = z * (z * z + (base - 1)) - base
  bailout:
    |z| <= 4
}
