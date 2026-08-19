; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_71ab3539_56d9_5792_9c33_2cc7a67b73ac {
  init:
    z = pixel
  loop:
    z = (sqr(z) + pixel) / (sqr(pixel) + z)
  bailout:
    |z| <= 4
}
