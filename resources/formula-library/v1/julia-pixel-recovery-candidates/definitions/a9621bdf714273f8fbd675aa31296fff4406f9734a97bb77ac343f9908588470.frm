; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_9cd1e5fd_0d01_5371_ae9a_37d6ec85d93b {
  parameters:
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      f = pixel ^ 0.5
    else
      f = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = fn1(z) + f
  bailout:
    |z| <= 50
}