; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_8cde6ebb_f5cc_577e_8abc_9e4d20c1d994 {
  init:
    z = pixel
    offsetValue = cotanh(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

