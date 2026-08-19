; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7d41553d_885e_5f7a_810e_3be60046c9f9 {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    horizontal = real(z)
    vertical = imag(z)
    horizontalNext = (-exp(horizontal)) * cos(vertical) + offset
    verticalNext = (-exp(horizontal)) * sin(vertical)
    z = horizontalNext + flip(verticalNext)
  bailout:
    |z| <= 100
}
