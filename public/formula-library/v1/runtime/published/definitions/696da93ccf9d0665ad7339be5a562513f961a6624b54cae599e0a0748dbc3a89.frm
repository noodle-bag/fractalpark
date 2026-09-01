; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ca15991c_ebe9_5bd1_b6f6_04b6067ab90f {
  parameters:
    thresholdShift: complex = (0, 0) classic p1
  init:
    z = pixel
    limit = thresholdShift + 3
  loop:
    z = log(z) * sin(z)
  bailout:
    LastSqr < real(limit) * real(limit)
}
