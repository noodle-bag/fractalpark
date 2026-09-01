; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0cfbe9a6_cad4_51c5_a85c_345978b19bfe {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (z * (z * (-z + 9) - 18) + 6) / 6 + offset
  bailout:
    |z| < 100
}
