; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2f0a0f01_53ee_585e_b2bd_6179a0413df1 {
  init:
    if ismand
      pointValue = pixel
    else
      pointValue = c
    endif
    z = (0, 0)
    if !ismand
      z = pixel
    endif
  loop:
    z = z * z * z + z * (pointValue - 1) - pointValue
  bailout:
    |z| <= 4
}