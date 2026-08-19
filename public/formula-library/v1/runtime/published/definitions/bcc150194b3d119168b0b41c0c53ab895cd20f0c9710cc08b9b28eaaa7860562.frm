; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c91835ba_9dcc_559c_85fb_0e456ca9987d {
  parameters:
    seed: complex = (0, 0) classic p1
    limit: complex = (0, 0) classic p2
    firstTransform: function = identity classic fn1
    secondTransform: function = identity classic fn2
    thirdTransform: function = identity classic fn3
  init:
    z = seed
    counter = 1
  loop:
    z = firstTransform(z) + pixel
    z = secondTransform(z) + pixel
    z = thirdTransform(z) + pixel
    counter = counter + 1
  bailout:
    |z| <= real(limit)
}
