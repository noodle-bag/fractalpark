; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cc4886bd_bff6_5563_b798_677da9a92dab {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = (z * (z * (z * (z * (-z + 25) - 200) + 600) - 600) + 120) / 120 + offset
  bailout:
    |z| < 100
}
