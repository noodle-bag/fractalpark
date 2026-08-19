; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_d541fbeb_4dcc_5fc9_9b88_116bb28bf327 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = c * tan(z)
  bailout:
    |z| <= 256
}