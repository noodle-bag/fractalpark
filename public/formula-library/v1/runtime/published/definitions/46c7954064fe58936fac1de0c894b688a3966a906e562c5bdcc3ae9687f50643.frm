; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_9c60877e_d554_5578_b7ba_90405b44d604 {
  parameters:
    limitOffset: complex = (0, 0) classic p1
  init:
    z = pixel
    limitValue = limitOffset + 3
  loop:
    z = cosh(z) - sqr(z)
  bailout:
    |z| < real(limitValue)
}

