; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_bfb1ea12_9b8e_512b_830e_06ef19a94198 {
  init:
    z = pixel
    offsetValue = pixel ^ pixel
  loop:
    z = cosxx(z) + offsetValue
  bailout:
    |z| <= 50
}

