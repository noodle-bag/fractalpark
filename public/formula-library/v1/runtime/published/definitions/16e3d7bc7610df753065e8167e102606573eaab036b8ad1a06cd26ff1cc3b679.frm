; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_f7a06a52_361c_598f_bf99_5e55a0047f1f {
  init:
    cclassic = c
    cclassic = pixel
    z = cclassic
  loop:
    z = z * z * z / 5 + z * z + cclassic
  bailout:
    |z| <= 100
}