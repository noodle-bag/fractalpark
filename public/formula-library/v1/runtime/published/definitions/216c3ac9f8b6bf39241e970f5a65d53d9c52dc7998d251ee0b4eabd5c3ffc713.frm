; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_070664be_6b62_5383_938f_4f89e73df367 {
  init:
    z = 0
    q = pixel
  loop:
    q = flip(q)
    z = z ^ 2 + q
  bailout:
    |z| <= 4
}
