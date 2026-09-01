; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_ae504daa_09cc_5a59_8052_c91b9535ff24 {
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
    z = sqr(z) + carrier
  bailout:
    |z| < 4
}