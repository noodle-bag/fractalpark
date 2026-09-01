; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3c71e05b_12c2_5eae_b4c7_b4bc36f52dc2 {
  parameters:
    transform: function = identity classic fn1
  init:
    z = pixel
  loop:
    z = (z / 2.7182818) ^ z * transform(6.2831853 * z) + pixel
  bailout:
    |z| <= 4
}
