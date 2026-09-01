; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a2f48cb8_1aa3_5b80_bf04_e10ddc033ed0 {
  init:
    z = pixel
  loop:
    z = sqr(z) * z + (pixel - 1) * z - pixel
  bailout:
    |z| <= 4
}
