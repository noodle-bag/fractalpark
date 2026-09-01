; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, floored-log
Formula_68dbf03a_d943_55ae_ba14_8a597d4c8477 {
  parameters:
    offset: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    z = pixel
    factor = transform(pixel) + offset
    divisor = log(offset)
  loop:
    z = (factor * 3.1416) * log(z) / divisor
  bailout:
    |z| <= 5
}
