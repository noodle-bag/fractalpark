; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a9263b21_23c1_5d94_ba30_f7bef1a66629 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    if |z| > 0.001
      z = z2 + c / z
    else
      z = z2 + c
    endif
  bailout:
    |z| <= 256
}