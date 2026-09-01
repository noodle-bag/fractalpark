; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_1936e9b5_1312_593e_ab67_72e95bc514b0 {
  init:
    z = pixel
    sinp = sin(pixel)
  loop:
    z = sin(z) + sinp
  bailout:
    |z| <= 50
}