; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_d81aaac8_9440_5241_95ab_5791f8fbb141 {
  parameters:
    coefficient: complex = (0, 0) classic p1
  init:
    z = ((1 - pixel) / (3 * coefficient)) ^ 0.5
  loop:
    z = coefficient * z * z * z + (pixel - 1) * z - pixel
  bailout:
    |z| <= 100
}
