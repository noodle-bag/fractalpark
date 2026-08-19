; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_81bf246a_0822_57e7_b659_cce3fbd8d818 {
  parameters:
    exponent: complex = (0, 0) classic p1
  init:
    q = pixel
    z = q
  loop:
    z = conj(z) ^ exponent + pixel
  bailout:
    |z| <= 4
}
