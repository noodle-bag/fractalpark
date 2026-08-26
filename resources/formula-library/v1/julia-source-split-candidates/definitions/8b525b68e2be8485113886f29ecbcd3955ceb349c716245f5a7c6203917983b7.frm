; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3a6e9b04_e85d_54ad_8de9_7e7fc980bf42 {
  init:
    if ismand
      pointValue = pixel
    else
      pointValue = c
    endif
    exponentValue = (2.5, 0.5)
    z = pointValue
    if !ismand
      z = pixel
    endif
  loop:
    z = z ^ exponentValue + pointValue
  bailout:
    |z| < 4
}