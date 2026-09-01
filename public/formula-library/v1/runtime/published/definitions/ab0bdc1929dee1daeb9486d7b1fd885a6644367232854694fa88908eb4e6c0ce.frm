; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_09ee96d1_18a8_5dad_83e1_d05f0c59be4b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = 2 * (z * z) - (1, 0) + c
  bailout:
    |z| <= 256
}