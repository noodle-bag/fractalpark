; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_7953b392_8bc6_5913_be0a_d458c854647f {
  parameters:
    constant: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(z) * z + conj(constant)
  bailout:
    |z| <= 4
}
