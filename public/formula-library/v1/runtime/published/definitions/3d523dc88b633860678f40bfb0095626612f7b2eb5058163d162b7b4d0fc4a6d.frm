; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1f56b41c_720e_5a42_9772_dd3a64ce8391 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + rate * z
  bailout:
    |z| <= 4
}
