; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: floored-log
Formula_97e2fc76_3590_5119_8b38_d8cc43f18d74 {
  parameters:
    parameter1: complex = (0, 0) classic p1
    function1: function = identity classic fn1
  init:
    z = pixel
    if ismand
      y = fn1(z)
    else
      y = c
    endif
    base = log(p1)
    if !ismand
      z = pixel
    endif
  loop:
    z = y * log(z) / base
  bailout:
    |z| <= 4
}