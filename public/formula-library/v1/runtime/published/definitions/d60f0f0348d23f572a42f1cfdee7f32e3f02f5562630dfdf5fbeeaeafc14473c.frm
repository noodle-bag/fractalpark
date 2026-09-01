; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_11c43e72_94aa_5b99_a899_f9de9ec1fb66 {
  parameters:
    initialValue: complex = (0, 0) classic p1
  init:
    z = real(initialValue)
  loop:
    z = z * pixel - pixel / sqr(z)
    z = flip(z)
  bailout:
    |z| < 8
}
