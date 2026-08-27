; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_a903b5ad_0378_5e5f_ab42_f1bfe15b919c {
  parameters:
    threshold: complex = (0, 0) classic p1
  init:
    if ismand
      q = pixel
    else
      q = c
    endif
    z = q
    if !ismand
      z = pixel
    endif
  loop:
    z = z ^ q + q
  bailout:
    |z| < real(threshold)
}