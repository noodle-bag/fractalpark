; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_563693bd_ba1d_5628_b402_98a98a5b4043 {
  parameters:
    offset: complex = (0, 0) classic p1
    outerTransform: function = identity classic fn1
    innerTransform: function = identity classic fn2
  init:
    z = pixel
  loop:
    z = pixel * outerTransform(innerTransform(z + offset))
  bailout:
    |z| <= 4
}
