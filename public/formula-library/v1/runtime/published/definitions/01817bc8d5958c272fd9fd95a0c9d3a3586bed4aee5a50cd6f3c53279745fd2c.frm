; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d808ce74_e717_5d98_af4c_dab9d713f01e {
  parameters:
    rate: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + rate * transform(state)
  bailout:
    |z| <= 4
}
