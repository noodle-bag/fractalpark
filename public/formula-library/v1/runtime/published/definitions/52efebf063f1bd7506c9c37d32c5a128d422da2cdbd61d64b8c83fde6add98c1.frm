; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a86f88ad_cfed_59dc_a83b_93e77917e842 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    a = real(z)
    b = imag(z)
    u = 2 * a * b
    v = a * a - b * b
    d = -2 * u * v + offset
    b = v * v - u * u
    z = d + b
  bailout:
    |z| <= 4
}
