; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d8ed1025_8ccf_5424_b161_df178a36a0fa {
  init:
    z = pixel
    z = sqr(z)
  loop:
    z = z + pixel
    z = sqr(z)
  bailout:
    LastSqr <= 4
}