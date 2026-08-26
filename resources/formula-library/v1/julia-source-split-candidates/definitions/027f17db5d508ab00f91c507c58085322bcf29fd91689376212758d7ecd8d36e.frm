; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e25a768a_a075_5ecb_bb65_9271354a94e2 {
  init:
    if ismand
      carrier = pixel
    else
      carrier = c
    endif
    z = (0, 0)
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) * z + z * (carrier - 1) - carrier
  bailout:
    abs(z) <= 4
}