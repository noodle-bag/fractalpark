; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_0ba0b082_c4b0_51d8_b981_7ca1ca25b9f3 {
  parameters:
    seed: complex = (0, 0) classic p1
    escapeLimit: complex = (0, 0) classic p2
    earlyTransform: function = sqr classic fn1
    numeratorTransform: function = sin classic fn2
    denominatorTransform: function = cosxx classic fn3
  init:
    z = seed
    roundCount = 1
  loop:
    if roundCount < 10
      z = earlyTransform(z) + pixel
    else
      z = numeratorTransform(z) / denominatorTransform(z) + pixel
    endif
    roundCount = roundCount + 1
  bailout:
    |z| <= real(escapeLimit)
}
