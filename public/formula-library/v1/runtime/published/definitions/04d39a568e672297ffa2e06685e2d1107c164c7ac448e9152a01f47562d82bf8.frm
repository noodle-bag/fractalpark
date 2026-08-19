; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_7c9a2273_28b9_5850_b521_9689a84a3700 {
  init:
    z = 1 / pixel
    seed = z
  loop:
    z = cos(z) + 2 * seed
  bailout:
    |z| <= 4
}
