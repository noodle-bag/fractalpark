; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cc489215_c7d7_5f2c_b11a_1be049b167bd {
  init:
    z = pixel
  loop:
    z = log(z) * pixel
  bailout:
    |z| <= 50
}