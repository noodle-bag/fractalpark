; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_cf335fbe_f1d3_5335_a68b_738197760a06 {
  parameters:
    juliaConstant: complex = (0, 0) classic p1
    threshold: complex = (0, 0) classic p2 ; Classic default profile retains p2 at zero.
  init:
    if ismand
      z = 0
      orbitConstant = pixel
    else
      z = pixel
      orbitConstant = juliaConstant
    endif
  loop:
    z = recip(sqr(z) + orbitConstant)
  bailout:
    |z| <= real(threshold)
}
