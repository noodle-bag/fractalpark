; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_58edc237_4978_5aed_8229_028b1d9cbbb9 {
  init:
    cclassic = c
    z = pixel
    cclassic = z
  loop:
    z = z * z + cclassic
    cclassic = (1 + imag(cclassic)) * real(cclassic) / 2 + z
  bailout:
    |z| <= 4
}