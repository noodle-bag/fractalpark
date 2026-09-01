; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d90c3a37_4a7a_5939_af78_67d0a8724e58 {
  parameters:
    limitShift: complex = (0, 0) classic p1
  init:
    source = pixel
    limit = limitShift + 3
    square = sqr(source)
    factor = (square + 1) / (5 * source) + square
    adjustment = sqr(factor) * limitShift
    z = -factor
  loop:
    z = sqr(z) - adjustment * z + factor
  bailout:
    |z| < real(limit)
}
