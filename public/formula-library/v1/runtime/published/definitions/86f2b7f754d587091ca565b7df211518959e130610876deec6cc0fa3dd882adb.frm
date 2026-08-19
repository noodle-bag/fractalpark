; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6ed1543a_f382_5daf_9bec_4f26f7ffed04 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * z * (sqr(z) * (sqr(z) - 4) + 3)
  bailout:
    |z| < 100
}
