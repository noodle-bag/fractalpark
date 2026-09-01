; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_82df8478_c0f0_5b64_86fe_5bc56b4a462b {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    negativeTransform: function = sqr classic fn1
    nonnegativeTransform: function = sqr classic fn2
  init:
    z = seed
  loop:
    coordinate = real(z)
    if coordinate < 0
      z = negativeTransform(z) + pixel
    else
      z = nonnegativeTransform(z) - pixel
    endif
  bailout:
    |z| <= real(limit)
}
