; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a8ec7595_53a9_52cc_994c_e4a09fe63d83 {
  parameters:
    offset: complex = (0, 0) classic p1
    limitOffset: complex = (0, 0) classic p2
    pixelTransform: function = identity classic fn1
    orbitTransform: function = identity classic fn2
  init:
    constant = pixelTransform(pixel)
    limit = 4 + real(limitOffset)
    z = pixel
  loop:
    z = orbitTransform(z * z) + constant + offset
  bailout:
    |z| < limit
}
