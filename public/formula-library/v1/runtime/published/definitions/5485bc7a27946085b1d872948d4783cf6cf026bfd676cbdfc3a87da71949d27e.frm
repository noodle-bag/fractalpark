; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_91653f7a_de43_5f1e_ab4d_c98f815b879b {
  init:
    z = pixel
    offsetValue = pixel ^ sin(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

