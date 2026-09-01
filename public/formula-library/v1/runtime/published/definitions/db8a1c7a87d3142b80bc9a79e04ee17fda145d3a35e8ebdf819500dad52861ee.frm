; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7d7ac95b_e1aa_53d0_a306_a2be1aa2b095 {
  parameters:
    parameter1: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    x = 1 - abs(imag(z) * real(p1) - real(z))
    z = 1 - abs(1 - real(x) - imag(z)) + real(x)
  bailout:
    |z| <= 1
}