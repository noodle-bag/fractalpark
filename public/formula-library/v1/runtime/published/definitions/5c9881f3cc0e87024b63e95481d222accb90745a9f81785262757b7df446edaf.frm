; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5ebf37c7_2ce9_53ef_a6ec_fdbfa5c8742c {
  init:
    z = pixel
  loop:
    z = (z / 2.7182818) ^ z / sqr(6.2831853 * z) + pixel
  bailout:
    |z| <= 4
}