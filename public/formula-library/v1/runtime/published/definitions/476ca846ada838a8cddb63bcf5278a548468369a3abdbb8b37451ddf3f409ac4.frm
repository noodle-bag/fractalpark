; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_c1668bd9_76d4_5e34_813e_a5bb8898008c {
  parameters:
    offset: complex = (0, 0) classic p1
  init:
    z = pixel
  loop:
    z = sin(sqr(z) + offset)
  bailout:
    |z| <= 4
}

