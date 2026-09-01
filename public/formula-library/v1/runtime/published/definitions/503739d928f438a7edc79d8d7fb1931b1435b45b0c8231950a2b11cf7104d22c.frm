; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_280229ec_dd2f_5982_9954_75829a37a5f2 {
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