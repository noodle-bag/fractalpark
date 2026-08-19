; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b2c06ce2_e976_571a_af8b_c20203c91bc2 {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    carrier = constant
    z = pixel
  loop:
    z = sqr(z) * z + z * (carrier - 1) - carrier
  bailout:
    |z| <= 4
}
