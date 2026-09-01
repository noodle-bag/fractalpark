; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_51daceff_89f2_5567_bfe2_ca2933f2402c {
  parameters:
    coefficient: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = 1 / (z * z * z + (coefficient - 1) * z - coefficient)
  bailout:
    |z| <= 4
}
