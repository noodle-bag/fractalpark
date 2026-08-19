; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0f6c423d_2d1f_5b44_ad96_b4798b2a5fc5 {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = scale * z * (z * z * (z * z - 4) + 3)
  bailout:
    |z| < 100
}
