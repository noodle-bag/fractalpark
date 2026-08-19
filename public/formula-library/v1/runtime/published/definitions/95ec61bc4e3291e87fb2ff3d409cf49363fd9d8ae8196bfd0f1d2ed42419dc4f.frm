; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1be7d921_6d6e_5141_9387_d7a6c5493eac {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(conj(z)) * conj(z) + conj(offset)
  bailout:
    |z| <= 4
}
