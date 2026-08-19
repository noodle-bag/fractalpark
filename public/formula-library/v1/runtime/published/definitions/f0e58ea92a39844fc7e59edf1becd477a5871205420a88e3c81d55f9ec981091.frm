; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_126b0255_8e0b_535c_b752_36473c926fe9 {
  parameters:
    scale: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = scale * z * (z * z - 2)
  bailout:
    |z| < 100
}
