; @language: frm-like/1
; @stdlib: 1
; @numeric-profile: standard32
Formula_32bccc7f_91c2_533c_9f14_46c1943358fe {
  parameters:
    multiplierOffset: complex = (0, 0) classic p1
    limitOffset: complex = (0, 0) classic p2
    transform: function = identity classic fn1
  init:
    firstRegister = pixel
    secondRegister = firstRegister
    z = secondRegister
    multiplier = 1 + multiplierOffset
    limit = 5 + real(limitOffset)
  loop:
    transformed = transform(z)
    if real(transformed) <= real(secondRegister)
      selected = secondRegister
    else
      selected = firstRegister
    endif
    firstRegister = secondRegister
    secondRegister = z
    z = transformed * multiplier + selected
  bailout:
    |z| <= limit
}
