; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_54fa972b_b4c3_5ec2_a47f_e00141e22dfc {
  parameters:
    offset: complex = (0, 0) classic p1
    exponentValue: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    z = z ^ exponentValue + conj(offset)
  bailout:
    |z| <= 4
}
