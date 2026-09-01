; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_92287c3c_4301_5481_9397_092a089de3af {
  parameters:
    coefficient: complex = (0, 0) classic p1
  init:
    z = 0
    state = pixel
    sequence = 1
  loop:
    z = z ^ 2 + state
    state = state + (sequence * coefficient) / z
    sequence = ((11 - 3 * sequence) * sequence - 4) / 2
  bailout:
    |z| <= 4
}
