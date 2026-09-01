; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ccfe0283_df10_5b17_bd2a_5f3cdfd69b4a {
  parameters:
    exponent: complex = (0, 0) classic p1
  init:
    z = (0.001, 0)
  loop:
    z = z ^ exponent + (1 / pixel) ^ exponent
  bailout:
    |z| <= 100
}
