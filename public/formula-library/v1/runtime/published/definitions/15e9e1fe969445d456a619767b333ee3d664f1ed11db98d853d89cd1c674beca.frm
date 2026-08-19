; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_cb9f75de_2acb_563b_9090_f58f17e65f92 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = acosh(z) + c
  bailout:
    |z| <= 256
}