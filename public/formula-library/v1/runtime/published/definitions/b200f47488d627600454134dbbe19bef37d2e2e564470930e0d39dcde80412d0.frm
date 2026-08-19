; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2e810d90_19b3_5434_ab66_248c7675913f {
  parameters:
    rate: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + rate * transform(z)
  bailout:
    |z| <= 4
}
