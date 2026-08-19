; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_59a0bf0a_ddf3_5f3e_ad94_984d10cdc42a {
  parameters:
    constant: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    q = constant
    z = transform(pixel)
  loop:
    z = sqr(z) * z + z * (q - 1) - q
  bailout:
    |z| <= 4
}
