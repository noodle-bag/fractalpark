; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d93a2f0f_7208_5019_ad82_7a1d319a4412 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
    if |z| < 0.00001
      z = (0.00001, 0)
    endif
  loop:
    z = c * log(z)
  bailout:
    |z| <= 256
}