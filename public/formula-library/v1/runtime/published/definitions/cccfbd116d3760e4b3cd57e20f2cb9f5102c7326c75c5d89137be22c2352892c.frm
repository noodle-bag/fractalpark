; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log
Formula_20e16f12_e0e9_5f56_9364_5c2b60c05f20 {
  parameters:
    threshold: complex = (0, 0) classic p1 ; Classic default profile retains p1 at zero.
  init:
    z = pixel
  loop:
    z = exp(z * log(z))
  bailout:
    |z| <= real(threshold)
}
