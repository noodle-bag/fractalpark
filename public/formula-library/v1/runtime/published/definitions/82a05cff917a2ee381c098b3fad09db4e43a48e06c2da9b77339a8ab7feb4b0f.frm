; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_1faac719_6536_5496_a61c_f7c739b78f12 {
  init:
    z = pixel
    offset = pixel ^ exp(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
