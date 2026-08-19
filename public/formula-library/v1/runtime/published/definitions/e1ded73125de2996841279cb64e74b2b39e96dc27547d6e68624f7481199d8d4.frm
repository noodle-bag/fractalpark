; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_85f4fcd2_42ed_5608_83a9_896ffa2e0129 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * (sqr(z) - 1)
  bailout:
    |z| < 100
}
