; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e6716e4b_be44_52a2_befd_77354070e972 {
  parameters:
    exponent: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = (0, 0)
  loop:
    z = sqr(z) * z + z * (carrier - 1) - carrier ^ exponent
  bailout:
    |z| <= 4
}
