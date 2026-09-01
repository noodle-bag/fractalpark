; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_56935004_bdb8_5682_974f_3821cd422965 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z = z * z - conj(z) * c + c
  bailout:
    |z| <= 256
}