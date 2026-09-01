; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_3a6e9b04_e85d_54ad_8de9_7e7fc980bf42 {
  init:
    pointValue = pixel
    exponentValue = (2.5, 0.5)
    z = pointValue
  loop:
    z = z ^ exponentValue + pointValue
  bailout:
    |z| < 4
}
