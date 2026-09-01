; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_2e7a0672_e737_52fc_b2b3_14f577546eea {
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
    z = fn2(fn1(z) + anchor) + anchor
  bailout:
    |z| < 4
}