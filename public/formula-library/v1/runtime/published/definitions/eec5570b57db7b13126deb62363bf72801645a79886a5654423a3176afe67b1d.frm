; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3832742e_41f6_5d14_8749_a4955ab123fb {
  parameters:
    f1: function = identity classic fn1
  init:
    z = pixel
    s = z
  loop:
    z = z * z + s
    s = (1 + imag(f1(s))) * real(f1(s)) / 3 + z
  bailout:
    |z| <= 4
}
