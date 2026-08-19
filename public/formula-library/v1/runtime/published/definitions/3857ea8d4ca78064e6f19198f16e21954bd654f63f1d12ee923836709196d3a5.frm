; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b6ccba60_aba6_5136_9c92_679ae55ba5ce {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = c * asinh(z)
  bailout:
    |z| <= 256
}