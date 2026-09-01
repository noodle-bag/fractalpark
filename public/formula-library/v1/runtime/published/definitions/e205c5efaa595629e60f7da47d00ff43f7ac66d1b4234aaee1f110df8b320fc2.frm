; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3582fcef_3d34_5acf_a701_4d5a9165ebc7 {
  parameters:
    exponent: complex = (0, 0) classic p1
    offset: complex = (0, 0) classic p2
  init:
    z = pixel
  loop:
    if z == 0 && real(exponent) > 0
      z = 0
    else
      z = z ^ real(exponent)
    endif
    z = z + offset
  bailout:
    |z| <= 4
}
