; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_bcde4dcc_ca1c_52cb_b5b2_b917aca39761 {
  init:
    z = pixel
    offsetValue = 1 / sinh(pixel)
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

