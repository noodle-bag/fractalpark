; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_34325634_553e_5841_9ae0_bcb17954060c {
  init:
    pointValue = pixel
    z = (0, 0)
  loop:
    z = sqr(z) + pointValue
  bailout:
    |z| < 4
}
