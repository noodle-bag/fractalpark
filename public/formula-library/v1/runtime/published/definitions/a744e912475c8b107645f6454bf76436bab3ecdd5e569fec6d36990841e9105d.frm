; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_28c77140_c5f9_557a_93d7_cac12cf08e63 {
  init:
    sinusoid = sin(pixel)
    z = (0, 0)
  loop:
    z = z * z + sinusoid
  bailout:
    |z| < 4
}
