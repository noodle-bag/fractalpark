; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_c02008d3_60b8_5494_99eb_bdec331227ca {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    earlyTransform: function = sqr classic fn1
    middleTransform: function = exp classic fn2
    lateTransform: function = cosxx classic fn3
  init:
    z = seed
    counter = 1
  loop:
    if counter < 10
      z = earlyTransform(z) + pixel
    endif
    if 10 <= counter && counter < 20
      z = middleTransform(z) + pixel
    endif
    if 20 <= counter
      z = lateTransform(z) + pixel
    endif
    counter = counter + 1
  bailout:
    |z| <= real(limit)
}
