; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: hyperbolic-clamp
Formula_2827125f_9ac7_585e_9f38_d8067abb8474 {
  init:
    z = pixel
    if ismand
      offset = exp(pixel)
    else
      offset = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = cosxx(z) + offset
  bailout:
    |z| <= 50
}