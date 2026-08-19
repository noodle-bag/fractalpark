; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_769fa5c9_0c91_5628_8971_eff383502158 {
  init:
    z = pixel
    offset = cosh(pixel)
  loop:
    z = cosh(z) + offset
  bailout:
    |z| <= 50
}
