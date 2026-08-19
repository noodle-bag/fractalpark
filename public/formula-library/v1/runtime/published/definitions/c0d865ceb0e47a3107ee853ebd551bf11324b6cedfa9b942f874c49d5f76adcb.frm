; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_87b4ebc7_ba9d_527b_ab3b_aaa45967b255 {
  init:
    z = pixel
    sine_offset = sin(pixel)
  loop:
    z = sqr(z) + sine_offset
  bailout:
    |z| <= 50
}
