; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_6d4aca24_66e6_5bcc_9cc6_e4e7c94d0a96 {
  parameters:
    numerator: complex = (0, 0) classic p1
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + numerator / z
  bailout:
    |z| <= 4
}
