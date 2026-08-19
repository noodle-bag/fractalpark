; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9c4b2d9f_48ce_5b9c_a71e_e6843a71501f {
  init:
    z = pixel
    offsetValue = exp(pixel)
  loop:
    z = exp(z) + offsetValue
  bailout:
    |z| <= 50
}

