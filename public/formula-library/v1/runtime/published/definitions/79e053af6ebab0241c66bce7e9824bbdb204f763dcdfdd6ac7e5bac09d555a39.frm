; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_ded18937_1f80_5248_a6f2_be82db2b676e {
  parameters:
    transform: function = identity classic fn1
  init:
    z = 0.5
  loop:
    z = z * pixel - pixel / transform(z)
  bailout:
    |z| < 8
}
