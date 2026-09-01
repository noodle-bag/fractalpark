; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_62423e7c_842d_5b59_b73d_03a40ec11da1 {
  parameters:
    scale: complex = (0, 0) classic p1
    constant: complex = (0, 0) classic p2
    real_transform: function = identity classic fn1
    imag_transform: function = identity classic fn2
  init:
    z = real_transform(real(pixel)) + scale * imag_transform(imag(pixel))
  loop:
    z = sqr(z) + constant
  bailout:
    |z| <= 4
}
