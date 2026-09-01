; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_54cc5b4b_9710_5995_a216_8f4c61ff1c02 {
  init:
    z = pixel
  loop:
    z = sqr(z) + (-0.74543, 0.2)
  bailout:
    |z| <= 4
}