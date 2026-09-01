; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_063f210d_e292_53a5_aab5_15150eb12ce2 {
  init:
    z = pixel
    offset = log(pixel)
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}
