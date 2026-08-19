; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_4082549c_cbbd_55ad_bb38_61e4eb3d46dd {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = scale * (2 * z * z - 1)
  bailout:
    |z| < 100
}
