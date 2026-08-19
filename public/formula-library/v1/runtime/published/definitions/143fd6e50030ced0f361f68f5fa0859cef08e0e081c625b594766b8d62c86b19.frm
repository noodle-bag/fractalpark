; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b0c3cd60_22b6_56cc_8e4e_2fd6cf9224d9 {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    carrier = constant
    z = pixel
  loop:
    z = sqr(z) * z + z * (carrier - 1) - carrier
  bailout:
    abs(z) <= 4
}
