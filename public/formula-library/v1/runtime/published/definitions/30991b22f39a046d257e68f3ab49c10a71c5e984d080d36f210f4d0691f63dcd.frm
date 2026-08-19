; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1cf46735_3e73_51f5_b752_48040233a417 {
  init:
    sourcePoint = pixel
    z = sourcePoint
  loop:
    z = sqr(z) + sourcePoint
  bailout:
    |z| < 4
}
