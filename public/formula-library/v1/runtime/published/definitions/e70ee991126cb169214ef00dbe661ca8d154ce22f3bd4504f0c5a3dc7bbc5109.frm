; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_b926b11a_815d_535c_b91c_facfb9399b21 {
  init:
    z = pixel
    offsetValue = sqr(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

