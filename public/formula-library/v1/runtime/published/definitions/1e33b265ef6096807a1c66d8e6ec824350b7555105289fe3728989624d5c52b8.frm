; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e5659975_2319_56c3_ab28_edf6f6981635 {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = carrier * (sqr(z) - 2)
  bailout:
    |z| < 100
}
