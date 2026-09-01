; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9c0fb578_8cb6_5793_9c94_af3f02e3a85b {
  parameters:
    cubic: complex = (0, 0) classic p1
    linear: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = cubic * z ^ 3 + (linear - 1) * z - linear
  bailout:
    |z| <= 100
}
