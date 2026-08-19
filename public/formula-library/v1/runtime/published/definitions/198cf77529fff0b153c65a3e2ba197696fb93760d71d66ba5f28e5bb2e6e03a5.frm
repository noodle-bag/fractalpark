; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_93e5f276_7b4a_56fa_9e2e_9989ca19c710 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    a = real(z)
    b = imag(z)
    d = offset - 2 * a * b
    b = b * b - a * a
    z = d + b
  bailout:
    |z| <= 4
}
