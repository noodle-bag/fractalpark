; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division, hyperbolic-clamp
Formula_76cb0ae7_7f3e_5bba_bb20_5bec91f9f3a6 {
  parameters:
    thresholdOffset: complex = (0, 0) classic p1
  init:
    z = pixel
    threshold = thresholdOffset + 3
  loop:
    z = sqr(1 / cosxx(z))
  bailout:
    |z| < real(threshold)
}
