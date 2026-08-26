; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_e03055ad_b642_5ada_b4ce_7819d9282cbe {
  parameters:
    limitOffset: complex = (0, 0) classic p1
    transform: function = identity classic fn1
  init:
    z = pixel
    if ismand
      juliaOrbitConstant = pixel
    else
      juliaOrbitConstant = c
    endif
    if !ismand
      z = pixel
    endif
  loop:
    z = juliaOrbitConstant ^ z + juliaOrbitConstant + transform(juliaOrbitConstant)
  bailout:
    |z| <= 3 + real(limitOffset)
}