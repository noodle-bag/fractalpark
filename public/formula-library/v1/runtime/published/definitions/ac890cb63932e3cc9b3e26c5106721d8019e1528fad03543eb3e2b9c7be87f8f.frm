; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_32af09e8_c0e1_59de_9193_43021db7fcdc {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = scale * z * (z * z * (z * z * (128 * z * z - 192) + 80) - 8)
  bailout:
    |z| < 100
}
