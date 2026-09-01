; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_641e81e3_1e4a_5539_bdce_1ee07521b421 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    a = real(z)
    b = imag(z)
    d = -a * b + offset
    b = 2 * b * b - 3 * a * a
    z = d + b
  bailout:
    |z| <= 4
}
