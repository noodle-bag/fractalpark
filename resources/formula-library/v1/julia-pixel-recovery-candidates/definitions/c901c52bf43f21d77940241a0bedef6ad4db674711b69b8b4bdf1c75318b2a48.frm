; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_b926b11a_815d_535c_b91c_facfb9399b21 {
  init:
    z = pixel
    if ismand
      offsetValue = sqr(pixel)
    else
      offsetValue = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}