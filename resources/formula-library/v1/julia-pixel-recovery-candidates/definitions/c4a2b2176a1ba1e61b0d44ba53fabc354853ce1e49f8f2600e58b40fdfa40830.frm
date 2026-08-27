; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_550b2811_b28e_552d_af2c_07deea1f019f {
  init:
    if ismand
      q = pixel
    else
      q = c
    endif
    z = (0, 0)
    if !ismand
      z = pixel
    endif
  loop:
    z = sqr(z) * z * z * (q - 1) - q
  bailout:
    |z| <= 4
}