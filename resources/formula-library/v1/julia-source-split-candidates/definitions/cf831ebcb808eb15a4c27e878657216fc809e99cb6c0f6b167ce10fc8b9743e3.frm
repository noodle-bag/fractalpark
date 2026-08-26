; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_d81aaac8_9440_5241_95ab_5791f8fbb141 {
  parameters:
    coefficient: complex = (0, 0) classic p1
  init:
    z = ((1 - pixel) / (3 * coefficient)) ^ 0.5
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = coefficient * z * z * z + (juliaOrbitConstant - 1) * z - juliaOrbitConstant
  bailout:
    |z| <= 100
}