; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_b5010cf1_03f9_5127_9d05_01e7e947dcec {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    carrier = pixel
    z = seed
  loop:
    z = carrier * z * (sqr(z) - 3)
  bailout:
    |z| < 100
}
