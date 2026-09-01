; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_338c7feb_1b14_556e_bc71_4383529f4f20 {
  parameters:
    divisor: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    z = 1 / pixel
    offset = z
  loop:
    z = transform(z) + offset / divisor
  bailout:
    |z| <= 4
}
