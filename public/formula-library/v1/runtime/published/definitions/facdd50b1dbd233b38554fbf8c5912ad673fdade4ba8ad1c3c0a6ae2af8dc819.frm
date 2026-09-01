; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_138723af_2481_5634_9a31_2cfabdc0094a {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sqr(z) + (offset + 1) / 2 + pixel
  bailout:
    |z| <= 4
}
