; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1768f194_bdc1_5881_b269_a58730967c2c {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z = z2 * z2 + c
  bailout:
    |z| <= 256
}