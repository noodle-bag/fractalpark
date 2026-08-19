; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c47127de_9359_5548_b99f_f9c69b21b79b {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    z = pixel
    p = p1 + 1
  loop:
    z = 1 - abs(imag(z) * p - real(z)) + (1 - abs(1 - real(z) - imag(z)))
  bailout:
    |z| <= 1
}