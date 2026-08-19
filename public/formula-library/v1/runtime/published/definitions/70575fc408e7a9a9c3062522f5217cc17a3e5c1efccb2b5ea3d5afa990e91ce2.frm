; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_5fba3d0c_c66e_5ad2_9415_584034543625 {
  parameters:
    numerator: complex = (0, 0) classic p1
  init:
    z = 0
    state = pixel
  loop:
    z = z ^ 2 + state
    state = state + numerator / state
  bailout:
    |z| <= 4
}
