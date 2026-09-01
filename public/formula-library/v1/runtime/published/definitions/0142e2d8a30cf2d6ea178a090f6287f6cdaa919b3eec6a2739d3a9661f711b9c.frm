; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_23808fdd_db5b_5dc8_87bd_19c42d2a5065 {
  init:
    z = pixel
    offset = cosxx(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
