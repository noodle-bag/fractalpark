; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
; @classic-guards: zero-division
Formula_28fe8474_fcfd_5fca_88ed_008e976c5707 {
  parameters:
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
    mapped = transform(z)
    z = 1 / (mapped * mapped) + juliaOrbitConstant
  bailout:
    |z| <= 50
}