; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_34fcff23_f75a_539c_9102_181945abee60 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    z3 = z2 * z
    z = z3 + c
  bailout:
    |z| <= 256
}