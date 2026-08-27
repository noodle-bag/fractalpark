; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_bcde4dcc_ca1c_52cb_b5b2_b917aca39761 {
  init:
    z = pixel
    if ismand
      offsetValue = 1 / sinh(pixel)
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