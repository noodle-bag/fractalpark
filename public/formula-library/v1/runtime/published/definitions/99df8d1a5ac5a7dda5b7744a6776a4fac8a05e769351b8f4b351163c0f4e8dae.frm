; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a69bc250_315d_5a74_9109_d23a820974e5 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = conj(z) ^ 6 + c
  bailout:
    |z| <= 256
}