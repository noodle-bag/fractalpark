; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_abc996b8_b004_5ec2_8ea8_661615271efc {
  parameters:
    rate: complex = (0, 0) classic p1
  init:
    q = rate
    z = pixel
  loop:
    z = q * z * (sqr(z) * (sqr(z) - 5) + 5)
  bailout:
    |z| < 100
}
