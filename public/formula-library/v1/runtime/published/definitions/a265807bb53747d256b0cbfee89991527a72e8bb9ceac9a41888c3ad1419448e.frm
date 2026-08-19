; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c1c898f3_c9a3_583d_9a0a_d09968ba0db3 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    actualZ = z + (0.5, 0)
    oneMinusZ = (1, 0) - actualZ
    z = c * (actualZ * oneMinusZ)
  bailout:
    |z| <= 256
}