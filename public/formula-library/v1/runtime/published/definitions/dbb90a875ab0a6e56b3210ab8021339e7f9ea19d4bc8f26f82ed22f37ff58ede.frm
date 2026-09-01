; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_09288426_4968_5e78_9ab0_00607cc290bd {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    z = seed
  loop:
    z = cosxx(sqr(z) + pixel) + pixel
  bailout:
    |z| <= 4
}
