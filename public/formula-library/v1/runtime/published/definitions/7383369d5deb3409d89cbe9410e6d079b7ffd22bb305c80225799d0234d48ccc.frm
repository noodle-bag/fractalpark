; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4fa3c747_6705_5d4c_9d3f_bfa9e3eb463a {
  init:
    s = pixel
    z = s
  loop:
    z = z ^ 2 + pixel + s
    s = s ^ 2 + pixel + z
  bailout:
    |z| <= 4
}
