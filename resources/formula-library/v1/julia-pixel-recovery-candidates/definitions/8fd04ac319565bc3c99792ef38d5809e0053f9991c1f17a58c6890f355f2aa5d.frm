; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_56fb67d7_2474_5076_8d59_ac9dbfb7c0b1 {
  parameters:
    transform: function = identity classic fn1
  init:
    z = pixel
    if ismand
      offset = 2 * pixel ^ pixel
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = transform(z) + offset
  bailout:
    |z| <= 50
}