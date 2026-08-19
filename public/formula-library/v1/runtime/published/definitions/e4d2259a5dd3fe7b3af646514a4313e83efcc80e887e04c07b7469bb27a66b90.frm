; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_00e14aa8_b766_54ea_a359_3f5d20d329b7 {
  parameters:
    power: real = 2
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    if power == 2
      z = z * z + c
    else
      z = z ^ power + c
    endif
  bailout:
    |z| <= 256
}