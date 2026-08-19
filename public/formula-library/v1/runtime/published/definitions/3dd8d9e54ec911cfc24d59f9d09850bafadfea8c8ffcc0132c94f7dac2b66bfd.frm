; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_ca6f9430_10c2_5d79_92dc_852c97c2feb9 {
  init:
    z = pixel
    offsetValue = cosh(pixel)
  loop:
    z = exp(z) + offsetValue
  bailout:
    |z| <= 50
}

