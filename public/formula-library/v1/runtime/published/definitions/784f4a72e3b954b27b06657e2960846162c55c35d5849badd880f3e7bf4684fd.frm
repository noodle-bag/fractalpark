; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_89eea36e_372e_5530_90f9_69879253080a {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(z) + conj(constant)
  bailout:
    |z| <= 4
}
