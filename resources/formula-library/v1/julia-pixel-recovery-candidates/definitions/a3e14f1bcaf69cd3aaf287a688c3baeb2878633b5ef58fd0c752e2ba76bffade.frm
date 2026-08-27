; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_0236be89_f1e9_5e23_b0a3_f4dd201ee788 {
  parameters:
    first: function = identity classic fn1
    second: function = identity classic fn2
  init:
    z = pixel
    if ismand
      anchor = pixel
    else
      anchor = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = fn1(z) + anchor
    z = fn2(z) + anchor
  bailout:
    |z| < 4
}