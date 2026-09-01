; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9cc91fab_f386_5ebc_9a71_722c4a8c7c75 {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * (sqr(z) * (sqr(z) * (64 * sqr(z) - 80) + 24) - 1)
  bailout:
    |z| < 100
}
