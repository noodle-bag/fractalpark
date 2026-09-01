; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_861ec40f_56db_530f_b5fd_918c038ea6d3 {
  init:
    z = pixel
    offset = sinh(pixel)
  loop:
    z = exp(z) + offset
  bailout:
    |z| <= 50
}
