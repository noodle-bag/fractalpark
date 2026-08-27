; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_de7a2025_caeb_58ac_b3ea_cf26c70c5e24 {
  init:
    z = pixel
    if ismand
      offsetValue = cosh(pixel)
    else
      offsetValue = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = sinh(z) + offsetValue
  bailout:
    |z| <= 50
}