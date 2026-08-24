; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_46acfdeb_2dac_59c9_a94a_fd4809420dc2 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = abs(z)
    z = p ^ 4 + c
  bailout:
    |z| <= 256
}