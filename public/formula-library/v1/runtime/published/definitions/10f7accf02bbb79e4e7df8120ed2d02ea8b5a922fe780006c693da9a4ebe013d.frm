; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e375f423_dfa4_54bf_9d56_c41215f4f72a {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    p = (0, 0)
    real(p) = abs(real(z))
    imag(p) = imag(z)
    z = p ^ 3 + c
  bailout:
    |z| <= 256
}