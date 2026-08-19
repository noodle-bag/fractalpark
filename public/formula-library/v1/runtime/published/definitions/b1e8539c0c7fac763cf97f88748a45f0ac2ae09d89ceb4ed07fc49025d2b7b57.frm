; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6b633456_4a1d_580e_9a61_6824ca303486 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    rabbitC = (-0.123, 0.745)
    z = z * z + rabbitC
  bailout:
    |z| <= 256
}