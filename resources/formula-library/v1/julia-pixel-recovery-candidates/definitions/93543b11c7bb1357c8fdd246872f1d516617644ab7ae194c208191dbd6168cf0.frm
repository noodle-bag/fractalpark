; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log, hyperbolic-clamp
Formula_1ecff9ef_b771_589a_a804_9eb223f43f60 {
  init:
    z = pixel
    if ismand
      offset = log(pixel)
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosh(z) + offset
  bailout:
    |z| <= 50
}