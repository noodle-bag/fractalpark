; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ed7e4ea5_2118_5ade_8fbc_19b5c2a6c8fc {
  parameters:
    carrier: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = carrier * z * (4 * sqr(z) - 3)
  bailout:
    |z| < 100
}
