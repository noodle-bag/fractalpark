; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_5982efd3_160d_5a50_9eaf_2629efd87ed6 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    a = real(z)
    b = imag(z)
    d = 3 * a * b * b - a * a * a + offset
    b = b * b * b - 3 * a * a * b
    z = d + b
  bailout:
    |z| <= 4
}
