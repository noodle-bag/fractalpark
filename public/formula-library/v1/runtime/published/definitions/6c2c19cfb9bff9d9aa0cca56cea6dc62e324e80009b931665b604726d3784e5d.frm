; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2dd8a5a7_052a_5539_aab9_c533f7dec857 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    z2 = z * z
    numerator = z2 + c
    denominator = z2 - c
    ratio = numerator / denominator
    z = ratio * ratio
  bailout:
    |z| <= 4
}