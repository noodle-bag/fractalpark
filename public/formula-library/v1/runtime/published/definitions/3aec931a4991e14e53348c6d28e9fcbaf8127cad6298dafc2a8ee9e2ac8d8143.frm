; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_12fc34ff_196d_5924_830e_6edb72dfc172 {
  init:
    if ismand
      z = 0
    else
      z = pixel
    endif
  loop:
    numerator = z + c
    denominator = z - c
    ratio = numerator / denominator
    z = ratio * ratio
  bailout:
    |z| <= 4
}