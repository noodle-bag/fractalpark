; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_32152c27_d299_585c_9ff9_bf236b575486 {
  parameters:
    offsetControl: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    offset = (offsetControl + 1) / 2
    z = sqr(sqr(z)) + offset
  bailout:
    |z| <= 4
}
