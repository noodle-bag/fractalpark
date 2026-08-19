; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_363cdbd3_c78f_5187_9ab1_74c2020b504e {
  init:
    z = pixel
    offset = cosh(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
