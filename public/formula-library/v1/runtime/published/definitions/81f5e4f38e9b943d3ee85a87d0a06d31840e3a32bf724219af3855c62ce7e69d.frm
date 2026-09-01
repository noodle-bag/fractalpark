; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9851c160_cf6c_5e04_b0bc_ce59657c4478 {
  parameters:
    shift: complex = (0, 0) classic p1
  init:
    q = pixel
    z = (shift + 1) / 2
  loop:
    z = sqr(z) + pixel * (shift + 1) / 2 + q
  bailout:
    |z| <= 4
}
