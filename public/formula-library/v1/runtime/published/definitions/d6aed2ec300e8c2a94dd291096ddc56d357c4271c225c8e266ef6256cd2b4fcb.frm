; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b9a54802_21b4_5cb9_8b8f_e4afc3c99f3b {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    a = conj(z)
    a2 = a * a
    z = a2 * a2 + c
  bailout:
    |z| <= 256
}