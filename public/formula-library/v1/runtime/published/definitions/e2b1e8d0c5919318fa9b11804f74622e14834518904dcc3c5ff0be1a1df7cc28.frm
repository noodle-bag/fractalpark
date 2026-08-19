; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9eca49f4_3219_5791_99fb_395ce7646f7c {
  init:
    cclassic = c
    z = pixel
    cclassic = pixel - sqr(z)
  loop:
    cclassic = pixel + cclassic / z
    z = cclassic - z * pixel
  bailout:
    |z| < 4
}