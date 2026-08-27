; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0bdb9874_8e03_5804_b215_af22cc413c41 {
  parameters:
    bailout_limit: complex = (0, 0) classic p1
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
    z = (sqr(z) + q) / (real(q) * real(q) + imag(q) * imag(q))
  bailout:
    |z| < real(bailout_limit)
}