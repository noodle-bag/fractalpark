; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_559966c9_b838_56af_9591_5cb42e8955ee {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = z * (sqr(z) * (sqr(z) * (429 * sqr(z) - 693) + 315) - 35) / 16 + q
  bailout:
    |z| < 100
}
