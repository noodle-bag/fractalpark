; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_6bf0fce4_9f20_5cb0_aa49_bd0202c16a1f {
  parameters:
    first: function = identity classic fn1
    second: function = identity classic fn2
  init:
    z = pixel
    if ismand
      orbitConstant = pixel
    else
      orbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = first(z) + orbitConstant
    z = second(z) + orbitConstant
  bailout:
    |z| < 4
}