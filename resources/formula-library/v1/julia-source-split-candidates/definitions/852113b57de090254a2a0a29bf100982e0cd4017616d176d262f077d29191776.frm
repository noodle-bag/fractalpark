; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_c04cedf4_32ec_5b61_b2da_f8bf988e05e0 {
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
    z = z * (sqr(z) + (carrier - 1)) - carrier
  bailout:
    |z| <= 4
}