; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_31680a23_4d7e_5844_a598_9682609d0ade {
  init:
    z = (0, 0)
  loop:
    z = 1 / flip(sqr(z) + pixel)
  bailout:
    |z| <= 4
}
