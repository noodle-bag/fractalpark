; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3f5a2b00_8250_5df6_b48f_0c79749cf4a5 {
  parameters:
    exponentValue: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = conj(z) ^ exponentValue + conj(pixel)
  bailout:
    |z| <= 4
}
