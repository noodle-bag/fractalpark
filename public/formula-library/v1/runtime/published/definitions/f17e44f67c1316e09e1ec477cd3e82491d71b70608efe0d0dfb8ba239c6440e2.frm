; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_90b86064_929f_5dc8_b671_0284b76ee3fb {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    outerTransform: function = cosxx classic fn1
    innerTransform: function = sin classic fn2
  init:
    z = seed
  loop:
    z = outerTransform(innerTransform(z + pixel)) + pixel
  bailout:
    |z| <= real(limit)
}
