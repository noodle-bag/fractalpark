; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_670ca9f2_5188_595e_86ea_6a44b7cb73e3 {
  parameters:
    seed: complex = (0, 0) classic p1
  init:
    q = pixel
    z = seed
  loop:
    z = q * z * (8 * sqr(z) - 4)
  bailout:
    |z| < 100
}
