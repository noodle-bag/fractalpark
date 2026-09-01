; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_623fec59_86d1_5702_88ee_4a638079c6b0 {
  init:
    if ismand
      q = pixel
    else
      q = c
    endif
    exponent = (2.5, 0.5)
    z = q
    if !ismand
      z = pixel
    endif
  loop:
    z = z ^ exponent + q
  bailout:
    |z| < 4
}